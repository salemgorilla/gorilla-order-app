import { list } from "@vercel/blob";

/**
 * IS THE BLOB STORE ACTUALLY THERE?
 *
 * ── WHY A VARIABLE CHECK WAS NOT ENOUGH ───────────────────────────────────
 * /api/artwork-upload reported `configured: Boolean(BLOB_READ_WRITE_TOKEN)`.
 * On 2026-09-01 that answered TRUE while production logged, on a real
 * customer's submission:
 *
 *   ARTWORK DIRECT UPLOAD FAILED in the customer's browser:
 *   "IMG_0528.jpeg" — Vercel Blob: This store does not exist.
 *
 * The token existed. The store it named did not. Every direct upload was
 * failing and the health endpoint called it configured.
 *
 * That is not a cosmetic wrong answer, because the browser reads it: the
 * upload box advertises "Maximum file size: 100 MB" when this says
 * configured, and 3.5 MB when it does not. So a broken store made the app
 * promise a 100 MB ceiling while the real one was 3.5 MB — and anything
 * over 3.5 MB is DROPPED from the quote (lib/upload-limits.ts). Stuart
 * Hinton's file was 204 KB and fit. The next one might not.
 *
 * `configured` now means "an upload will succeed", which is the only thing
 * anyone ever wanted it to mean. A credential that names something absent
 * is not configuration.
 *
 * ── WHY IT IS CACHED ──────────────────────────────────────────────────────
 * Every visitor's browser calls the endpoint on page load. A store probe on
 * each one is a network round-trip per pageview for an answer that changes
 * about once a month. The result is held for a minute — long enough that a
 * busy hour costs one probe, short enough that fixing the store in the
 * dashboard shows up while Gabe is still looking at the screen.
 *
 * A FAILURE IS CACHED FOR LESS TIME THAN A SUCCESS: the interesting moment
 * is the one just after someone reconnects a store, and waiting a full
 * minute to see it is how a fix gets mistaken for a non-fix.
 */

export type BlobHealth = {
  /** True only when the store answered. */
  reachable: boolean;
  /** Why not, verbatim from the SDK. Null when reachable. */
  error: string | null;
  /** False when there is no token to probe with — a different problem. */
  hasToken: boolean;
};

const OK_TTL_MS = 60_000;
const FAIL_TTL_MS = 10_000;

/**
 * How long the probe gets before it is called a failure.
 *
 * NOT optional, and NOT delegated. The SDK retries a network error TEN
 * times with backoff (VERCEL_BLOB_RETRIES defaults to "10"), so an
 * unreachable store holds the call for minutes — and this call is on the
 * page-load path for every visitor, which would turn a degraded store into
 * a hung artwork step.
 *
 * The SDK takes an `abortSignal` and it is passed one, but the deadline is
 * ALSO enforced here with a race. Measured: against a black-holed network,
 * `list` with AbortSignal.timeout(3000) had not returned 45 seconds later.
 * Whatever the reason, a health check's latency has to be bounded by code
 * this file controls rather than by a promise made in a dependency.
 *
 * Five seconds is far longer than a healthy list of one blob, and far
 * shorter than anyone will wait to be told a file size limit.
 */
const PROBE_TIMEOUT_MS = 5_000;

/** The sentence reported when the deadline, not the store, ended the probe. */
export const PROBE_TIMEOUT_MESSAGE = "The blob store did not answer in time.";

let cached: { at: number; value: BlobHealth } | null = null;

/**
 * The probe currently in flight, shared.
 *
 * Without this, a burst of visitors on a cold cache each start their own
 * probe — and against a slow store they all wait the full timeout instead
 * of one of them waiting and the rest reading the answer.
 */
let inFlight: Promise<BlobHealth> | null = null;

/** Drops the cache. For tests, and for a caller that must not see a stale yes. */
export function resetBlobHealthCache() {
  cached = null;
  inFlight = null;
}

/**
 * Ask the store whether it exists — see listOneBlob for the question.
 *
 * NEVER THROWS. This is a health check — it reports a failure, it does not
 * become one. A probe that threw would take out the endpoint the upload box
 * reads, and the box would then fall back to... calling the store broken,
 * which is the right answer arrived at the wrong way.
 */
export async function checkBlobStore(
  options: {
    /** Clock, for the cache windows. */
    now?: number;
    /**
     * The call that asks the store. Injected ONLY so the caching, the
     * deadline and the reporting can be tested without a network.
     *
     * It has to be INJECTED rather than stubbed: the SDK issues its request
     * through `undici.fetch`, not `globalThis.fetch`, so replacing the
     * global does nothing and the "stubbed" test quietly hits the real
     * Vercel Blob API and hangs. It did, for two debugging rounds. That is
     * why this parameter exists.
     */
    ask?: (token: string) => Promise<void>;
    /** Shorter deadline, for tests. Production uses PROBE_TIMEOUT_MS. */
    timeoutMs?: number;
  } = {}
): Promise<BlobHealth> {
  const now = options.now ?? Date.now();
  const ask = options.ask ?? listOneBlob;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    // No probe to run, and no cache: the answer is already free.
    return { reachable: false, error: null, hasToken: false };
  }

  if (cached) {
    const ttl = cached.value.reachable ? OK_TTL_MS : FAIL_TTL_MS;
    if (now - cached.at < ttl) return cached.value;
  }

  if (inFlight) return inFlight;

  inFlight = probe(token, ask, timeoutMs)
    .then((value) => {
      cached = { at: now, value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * The real question, in one line: list one blob.
 *
 * `list` rather than `head` — head needs a key that exists, and an empty
 * store is a perfectly healthy store. Limit 1 keeps it the cheapest call
 * that still proves the store answers.
 */
async function listOneBlob(token: string): Promise<void> {
  await list({
    limit: 1,
    token,
    // Passed so the SDK can abandon its own request and stop retrying. The
    // deadline that actually holds is the race in probe() — see
    // PROBE_TIMEOUT_MS for the measurement behind that.
    abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
}

/**
 * The deadline, enforced here rather than trusted to the caller's signal.
 *
 * The losing promise is left to settle on its own: there is nothing to
 * clean up (the probe writes to nothing) and rejecting it unhandled would
 * take the process down. `.catch(() => {})` is the whole cleanup.
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  work.catch(() => {});

  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(PROBE_TIMEOUT_MESSAGE)),
        ms
      );
      // Never hold a serverless invocation open for a health check.
      timer.unref?.();
    }),
  ]);
}

async function probe(
  token: string,
  ask: (token: string) => Promise<void>,
  timeoutMs: number
): Promise<BlobHealth> {
  try {
    await withDeadline(ask(token), timeoutMs);

    return { reachable: true, error: null, hasToken: true };
  } catch (error) {
    return {
      reachable: false,
      // The SDK's own words. "This store does not exist" is the sentence
      // that names the fix, and paraphrasing it would have cost a week.
      error: error instanceof Error ? error.message : String(error),
      hasToken: true,
    };
  }
}

/**
 * What to tell someone reading the health endpoint — one sentence naming
 * the next action, not a status word.
 */
export function describeBlobHealth(health: BlobHealth): string | null {
  if (health.reachable) return null;

  if (!health.hasToken) {
    return (
      "BLOB_READ_WRITE_TOKEN is not set — client uploads cannot use OIDC. " +
      "Copy the read-write token from the blob store into this project's " +
      "Production environment variables, then redeploy."
    );
  }

  // The store the token names is gone, or the token is stale. Both look the
  // same from the dashboard, where the store row appears perfectly healthy.
  //
  // The timeout message is already a full sentence about the store, so it
  // is used as-is rather than wrapped in a second one — "The blob store did
  // not answer: The blob store did not answer in time.." is how a health
  // endpoint stops being read.
  const what =
    health.error === PROBE_TIMEOUT_MESSAGE
      ? health.error
      : `The blob store did not answer: ${health.error}.`;

  return (
    `${what} ` +
    "Check Vercel → Storage: a store that was deleted and recreated gets a " +
    "new ID and a new token. Reconnect it to Production and redeploy. " +
    "Until then the app correctly advertises the smaller inline limit and " +
    "artwork over it is collected by email."
  );
}
