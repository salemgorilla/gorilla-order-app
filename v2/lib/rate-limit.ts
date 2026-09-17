/**
 * A crude per-key throttle, in one place.
 *
 * ── WHAT IT IS, AND WHAT IT IS NOT ────────────────────────────────────────
 * In-process. On serverless that means per-instance, so somebody spread
 * across instances gets more than the number here implies. It is NOT the
 * defence on any endpoint that uses it — the defence is always the thing
 * being asked for (an email that must match, a signed token). This makes
 * casual enumeration from one machine tedious, and it is honest about being
 * no more than that.
 *
 * ── WHY IT IS SHARED ──────────────────────────────────────────────────────
 * /api/order-status grew one of these inline. The drop-off lookup needs the
 * identical thing for the identical reason, and a second copy is how two
 * windows come to disagree after somebody tunes one. The Map is per-bucket
 * so two endpoints never share a budget.
 */

const WINDOW_MS = 60_000;

/** Beyond this many keys, sweep the dead ones. Unbounded growth is a slow leak. */
const SWEEP_AT = 5000;

const buckets = new Map<string, Map<string, number[]>>();

function bucketFor(name: string) {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

/**
 * Records a hit and says whether the caller is over the limit.
 *
 * `now` is injectable so a test can drive the window without sleeping.
 */
export function rateLimited(
  bucket: string,
  key: string,
  max: number,
  now = Date.now(),
  windowMs = WINDOW_MS
): boolean {
  const hits = bucketFor(bucket);
  const recent = (hits.get(key) || []).filter((at) => now - at < windowMs);

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > SWEEP_AT) {
    for (const [k, times] of hits) {
      if (!times.some((at) => now - at < windowMs)) hits.delete(k);
    }
  }

  return recent.length > max;
}

/** The caller's IP as well as the platform will tell us. Never trusted for auth. */
export function requestKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Tests only — the Map outlives a test file otherwise. */
export function resetRateLimits() {
  buckets.clear();
}
