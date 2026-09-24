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
 * ── WHERE IT DIFFERS FROM THE REAL PATH, EXACTLY ──────────────────────────
 * An earlier version of this comment claimed everything but the pathname
 * was "identical". It was not, and a self-test that overstates its own
 * fidelity is how a FALSE red gets believed — which is the failure this
 * endpoint exists to prevent, arrived at from the other side.
 *
 * The truth, three differences:
 *
 *   1. THE PATHNAME. Customer artwork lives under the prefixes
 *      isAllowedUploadPath() permits; this writes to its own, so a
 *      self-test object can never collide with, overwrite, or be mistaken
 *      for a real order's file. Deliberate, and worth the difference.
 *
 *   2. IT DOES NOT GO THROUGH /api/artwork-upload. It calls
 *      issueSignedToken and presignUrl directly, the same two calls that
 *      route makes. Going through the route would mean writing under a
 *      customer prefix, which (1) rules out.
 *
 *   3. THE PUT IS HAND-ROLLED. The SDK's own request path
 *      (createPutMethod -> requestApi) is not reachable from here: `put`
 *      does not publicly accept a presignedUrlPayload. So the headers
 *      requestApi always sends are set explicitly below — see PUT_HEADERS
 *      for which and why.
 *
 * Everything that decides whether the upload is AUTHORISED is shared: the
 * delegation, its scope, the signing, the presigned URL, and
 * addRandomSuffix — the one part of the presigned path that could never be
 * verified from a sandbox.
 */

/** Its own corner of the store. Never a prefix isAllowedUploadPath permits. */
export const SELFTEST_PREFIX = "_selftest/";

/** Small enough to be free, big enough to be a real body. */
const PROBE_BODY = "gorilla-labs upload self-test";

/**
 * The headers @vercel/blob's own requestApi sends on every PUT.
 *
 * Mirrored by hand because `put` does not publicly accept a
 * presignedUrlPayload, so the SDK's request path cannot be borrowed. A bare
 * fetch without these is a DIFFERENT request than the customer's, and this
 * endpoint's whole value is that its answer transfers.
 *
 *   x-vercel-blob-access  createPutHeaders sets it unconditionally from
 *                         options.access (chunk-OYCIHDFF.js:911). It is NOT
 *                         carried by the presigned URL — `access` is absent
 *                         from PRESIGN_CANONICAL_QUERY_KEYS and
 *                         buildPresignedPutUrl ignores it — so without this
 *                         header the access level is simply not stated.
 *   x-api-version         BLOB_API_VERSION, sent on every request
 *                         (chunk-OYCIHDFF.js:619, :764). An API that gates
 *                         on it would reject a request that omits it.
 *
 * If a bump to the SDK changes either, this test can go red on a healthy
 * store. That is the cost of not being able to reuse its request path, and
 * it is stated here rather than discovered.
 */
const PUT_HEADERS: Record<string, string> = {
  "x-vercel-blob-access": "public",
  "x-api-version": "12",
};

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
  /**
   * Whether the object this test wrote was removed again.
   *
   * True when nothing was written — there is nothing to clean up and
   * reporting a leak would be a false alarm.
   */
  cleanedUp: boolean;
  /**
   * Whether anything was written at all.
   *
   * Separate from `storedPathname`, which is only known when the response
   * parsed. A 200 PUT whose body could not be read wrote an object that
   * has no name here, and that is precisely the state that used to leak
   * silently.
   */
  wrote: boolean;
};

/** Bounded, because this runs behind an HTTP request like everything else. */
const STEP_TIMEOUT_MS = 8_000;

async function timed<T>(work: Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await work;
  return { value, ms: Date.now() - started };
}

/**
 * Leave the try block without leaving the FUNCTION.
 *
 * Every early `return` in here was a second exit that had to remember to
 * clean up, and one of them forgot — see the note on `wrote`. Throwing to
 * the single exit below makes the cleanup block unskippable.
 */
class SkipRest extends Error {}

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
  /** True once the store has an object, whatever the response body said. */
  let wrote = false;

  /**
   * WHICH step is in flight, tracked by NAME.
   *
   * This used to be inferred in the catch block from steps.length, with
   * three arms for four steps. A throw in step 4 — a slow `head`, a 404
   * from read-after-write lag, a transient 5xx — fell through to the last
   * arm and was recorded as "PUT to presigned url" AGAIN, with ok:false,
   * next to the ok:true entry the same step had already written. The
   * summary then named the PUT as the broken leg when the PUT had
   * succeeded, and "confirm the object exists" was unreachable from the
   * catch entirely.
   *
   * Naming which leg broke is the entire reason this endpoint exists, so
   * it cannot be derived from an array length that has to be kept in sync
   * by hand.
   */
  let current = "issue delegation";

  function record(step: string, ok: boolean, error: string | null, ms: number) {
    steps.push({ step, ok, error, ms });
    return ok;
  }

  try {
    current = "issue delegation";
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

    current = "presign PUT url";
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

    current = "PUT to presigned url";
    // 3 — the PUT a browser makes. THE step that has never run.
    const put = await timed(
      doFetch(presigned.value.presignedUrl, {
        method: "PUT",
        body: PROBE_BODY,
        headers: PUT_HEADERS,
        signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      })
    );

    if (!put.value.ok) {
      // The API's own words, which name the fix far better than a status.
      const body = await put.value.text().catch(() => "");
      record(
        current,
        false,
        `HTTP ${put.value.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
        put.ms
      );
      // NO early return. A non-2xx is the one case where nothing was
      // written, but falling through to the cleanup block costs nothing
      // and removes a second way out of this function that has to
      // remember to clean up. See the note on `wrote` below.
      throw new SkipRest();
    }

    /**
     * WROTE BEFORE PARSED.
     *
     * A 200 means the object EXISTS, whatever the body says. This used to
     * read `url` out of the body and return early when it was missing —
     * bypassing cleanup entirely, so an API shape change, an intercepting
     * proxy or a truncated body left one undeleted object in the shop's
     * store on every admin hit. And because the leak warning keyed off
     * `storedPathname`, which was also null in that case, it said nothing.
     *
     * The flag records that a write happened. Cleanup and the warning key
     * off it, not off whether the response parsed.
     */
    wrote = true;

    const result = (await put.value.json().catch(() => null)) as
      | { url?: string; pathname?: string }
      | null;

    storedUrl = result?.url ?? null;
    storedPathname = result?.pathname ?? null;
    record(current, true, null, put.ms);

    if (!storedUrl) {
      record(
        "read stored url",
        false,
        "the PUT succeeded but the response carried no url, so the object " +
          "that was written cannot be deleted",
        0
      );
      throw new SkipRest();
    }

    current = "confirm the object exists";
    // 4 — confirm it is really there. A 200 on the PUT is the API's word;
    // this is the store's.
    const confirmed = await timed(
      head(storedUrl, { abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS) })
    );
    record(
      current,
      confirmed.value.size === PROBE_BODY.length,
      confirmed.value.size === PROBE_BODY.length
        ? null
        : `stored ${confirmed.value.size} bytes, wrote ${PROBE_BODY.length}`,
      confirmed.ms
    );
  } catch (error) {
    // `current` names the leg that was in flight. Never inferred.
    if (!(error instanceof SkipRest)) {
      record(current, false, message(error), 0);
    }
  }

  // CLEANUP IS PART OF THE TEST. A self-test that leaves objects behind
  // becomes a slow leak in the shop's store, and the one thing worse than
  // no health check is one that quietly costs money.
  //
  // Reached on EVERY path now, including the ones that used to return
  // early. Gated on `wrote`, not on whether a url came back, because those
  // are different facts and the case where they disagree is exactly the
  // case that leaked.
  let cleanedUp = !wrote;
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
    wrote,
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

  // Keyed to `wrote`. It used to key to storedPathname, which is null in
  // the one case that actually leaks — a 200 PUT whose body did not parse
  // — so the operator was told nothing at all.
  const leak = result.wrote && !result.cleanedUp
    ? ` A test object may remain${
        result.storedPathname ? ` at ${result.storedPathname}` : " in the store, unnamed"
      }.`
    : "";

  return `Client uploads are broken at "${failed.step}": ${failed.error}.${leak}`;
}
