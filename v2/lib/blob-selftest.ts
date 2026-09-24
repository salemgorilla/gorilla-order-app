import { del, head, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * DOES A CUSTOMER'S UPLOAD ACTUALLY WORK? ASKED BY DOING IT.
 *
 * ── WHY A PROBE WAS NOT ENOUGH ────────────────────────────────────────────
 * lib/blob-health.ts asks the store to LIST one blob. That proves the store
 * answers, and between 21 and 24 September it proved exactly that while
 * every customer upload failed — three separate times, for three different
 * reasons, none of which a list would ever have caught:
 *
 *   1. a read-write token truncated to `vercel_blob_rw_<storeId>`
 *   2. the health check itself passing that token explicitly, so it tested
 *      a credential nothing else in the app used
 *   3. readBlobCredential returning "none" once that token was deleted,
 *      which made the upload route answer 501 to every customer
 *
 * Each was found by a person dropping a file and reporting what happened.
 * The app could have found all three itself, because the upload path is
 * four steps and every one of them is callable from a server.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────
 * The same four steps a browser takes, in order, against the real store:
 *
 *   issue a delegation -> presign a PUT -> PUT bytes -> confirm it landed
 *
 * then deletes what it wrote. A pass here means a customer's upload works,
 * not that the store is up.
 *
 * ── WHAT IT DELIBERATELY DOES NOT SHARE WITH THE REAL PATH ────────────────
 * The pathname. Customer artwork lives under the prefixes
 * isAllowedUploadPath() permits; this writes to its own, so a self-test can
 * never collide with, overwrite, or be mistaken for a real order's file.
 * Everything else — the delegation, the signing, the presigned URL, the
 * PUT — is identical, including addRandomSuffix, which is the one part of
 * the presigned path that could not be verified from a sandbox.
 */

/** Its own corner of the store. Never a prefix isAllowedUploadPath permits. */
export const SELFTEST_PREFIX = "_selftest/";

/** Small enough to be free, big enough to be a real body. */
const PROBE_BODY = "gorilla-labs upload self-test";

/**
 * The delegation's own size cap, set just above the probe body.
 *
 * Deliberately tight. If the cap were generous, a self-test that passed
 * would say nothing about whether maximumSizeInBytes is enforced at all —
 * and that cap is the only thing standing between a public upload endpoint
 * and someone writing 100 MB at a time.
 */
const PROBE_MAX_BYTES = 1024;

export type SelftestStep = {
  /** What was attempted, in the words of the path it mirrors. */
  step: string;
  ok: boolean;
  /** The failure, verbatim from the SDK. Null when it passed. */
  error: string | null;
  /** How long it took, so a slow store is visible before it is a dead one. */
  ms: number;
};

export type BlobSelftest = {
  ok: boolean;
  steps: SelftestStep[];
  /**
   * Where the object actually landed, when it did.
   *
   * Worth reporting because addRandomSuffix means it is NOT the pathname
   * that was asked for, and confirming that is half the point of the test:
   * the delegation names the requested path, the API appends the suffix,
   * and whether those two agree could not be verified without doing it.
   */
  storedPathname: string | null;
  /** Whether the object this test wrote was removed again. */
  cleanedUp: boolean;
};

/** Bounded, because this runs behind an HTTP request like everything else. */
const STEP_TIMEOUT_MS = 8_000;

async function timed<T>(work: Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await work;
  return { value, ms: Date.now() - started };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run the customer's upload path end to end and report each step.
 *
 * NEVER THROWS. It reports a failure; it does not become one.
 */
export async function runBlobSelftest(
  options: { now?: number; fetchImpl?: typeof fetch } = {}
): Promise<BlobSelftest> {
  const steps: SelftestStep[] = [];
  const doFetch = options.fetchImpl ?? fetch;

  // Unique per run, so two self-tests at once cannot delete each other's
  // object — and so a leaked one says when it leaked.
  const stamp = options.now ?? Date.now();
  const pathname = `${SELFTEST_PREFIX}${stamp}.txt`;

  let storedUrl: string | null = null;
  let storedPathname: string | null = null;

  function record(step: string, ok: boolean, error: string | null, ms: number) {
    steps.push({ step, ok, error, ms });
    return ok;
  }

  try {
    // 1 — the delegation. Exactly what /api/artwork-upload issues, including
    // the size cap, scoped to one pathname and one operation.
    const issued = await timed(
      issueSignedToken({
        pathname,
        operations: ["put"],
        maximumSizeInBytes: PROBE_MAX_BYTES,
        abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      })
    );
    record("issue delegation", true, null, issued.ms);

    // 2 — the presigned URL, with addRandomSuffix on, as the route sets it.
    const presigned = await timed(
      presignUrl(issued.value, {
        operation: "put",
        pathname,
        // The store is Public and customer artwork has to be readable by
        // the shop from an emailed link, so this mirrors it. A private
        // self-test would pass while public uploads broke.
        access: "public",
        maximumSizeInBytes: PROBE_MAX_BYTES,
        addRandomSuffix: true,
      })
    );
    record("presign PUT url", true, null, presigned.ms);

    // 3 — the PUT a browser makes. THE step that has never run.
    const put = await timed(
      doFetch(presigned.value.presignedUrl, {
        method: "PUT",
        body: PROBE_BODY,
        signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      })
    );

    if (!put.value.ok) {
      // The API's own words, which name the fix far better than a status.
      const body = await put.value.text().catch(() => "");
      record(
        "PUT to presigned url",
        false,
        `HTTP ${put.value.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
        put.ms
      );
      return { ok: false, steps, storedPathname, cleanedUp: false };
    }

    const result = (await put.value.json().catch(() => null)) as
      | { url?: string; pathname?: string }
      | null;

    storedUrl = result?.url ?? null;
    storedPathname = result?.pathname ?? null;
    record("PUT to presigned url", true, null, put.ms);

    if (!storedUrl) {
      record("read stored url", false, "the API returned no url", 0);
      return { ok: false, steps, storedPathname, cleanedUp: false };
    }

    // 4 — confirm it is really there. A 200 on the PUT is the API's word;
    // this is the store's.
    const confirmed = await timed(
      head(storedUrl, { abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS) })
    );
    record(
      "confirm the object exists",
      confirmed.value.size === PROBE_BODY.length,
      confirmed.value.size === PROBE_BODY.length
        ? null
        : `stored ${confirmed.value.size} bytes, wrote ${PROBE_BODY.length}`,
      confirmed.ms
    );
  } catch (error) {
    record(
      steps.length === 0
        ? "issue delegation"
        : steps.length === 1
        ? "presign PUT url"
        : "PUT to presigned url",
      false,
      message(error),
      0
    );
  }

  // CLEANUP IS PART OF THE TEST. A self-test that leaves objects behind
  // becomes a slow leak in the shop's store, and the one thing worse than
  // no health check is one that quietly costs money.
  let cleanedUp = false;
  if (storedUrl) {
    try {
      const removed = await timed(
        del(storedUrl, { abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS) })
      );
      cleanedUp = true;
      record("delete the test object", true, null, removed.ms);
    } catch (error) {
      record("delete the test object", false, message(error), 0);
    }
  }

  return {
    ok: steps.every((s) => s.ok),
    steps,
    storedPathname,
    cleanedUp,
  };
}

/** One sentence for whoever is reading this on a phone. */
export function describeSelftest(result: BlobSelftest): string {
  if (result.ok) {
    return "Client uploads work: a file was signed, uploaded, confirmed in the store and deleted again.";
  }

  const failed = result.steps.find((s) => !s.ok);

  if (!failed) {
    return "The self-test did not complete and did not say why.";
  }

  const leak = result.storedPathname && !result.cleanedUp
    ? ` A test object may remain at ${result.storedPathname}.`
    : "";

  return `Client uploads are broken at "${failed.step}": ${failed.error}.${leak}`;
}
