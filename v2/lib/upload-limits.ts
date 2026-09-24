import { isDropoffTokenShape } from "./dropoff";
import { isValidHandoffToken } from "./handoff";

/**
 * How much artwork can actually ride along with a quote.
 *
 * Vercel rejects a function request body over ~4.5 MB with a bare
 * 413 FUNCTION_PAYLOAD_TOO_LARGE, at the platform edge, BEFORE the route
 * handler runs. Nothing in app code can catch it or raise it.
 *
 * Measured against production 2026-08-06:
 *   1.0 MB -> 200      4.0 MB -> 200
 *   4.4 MB -> 413      5.0 MB -> 413      8.0 MB -> 413
 *
 * This is why desktop uploads failed while iOS worked: phone photos are 2-3 MB
 * and fit, print-ready PDF/EPS/PNG are 5-100 MB and do not. The format was
 * never the variable — the size was. The upload box used to advertise
 * "Maximum file size: 100 MB", which the platform had no way to honor.
 *
 * The multipart body also carries the order JSON and the artwork analysis, so
 * the file itself gets a budget below the hard cap rather than all of it.
 */
export const PLATFORM_BODY_LIMIT_BYTES = 4.4 * 1024 * 1024;

/** Budget for the file alone, leaving room for the JSON fields beside it. */
export const MAX_ATTACHED_ARTWORK_BYTES = 3.5 * 1024 * 1024;

/**
 * Budget for ALL inline artwork in one submission.
 *
 * With one design, per-file and per-request were the same number and that
 * equivalence was load-bearing — nothing had to add anything up. A cart breaks
 * it: three 2 MB files each pass the per-file check and together blow the
 * 4.4 MB platform limit, which kills the whole request at the edge and loses
 * the ORDER, not just an attachment.
 *
 * Deliberately the same 3.5 MB as the single-file budget rather than a
 * multiple of it, because the ceiling being protected is the request body and
 * that has not grown.
 *
 * DROP POLICY: files are attached in cart order until this is spent. Anything
 * that does not fit is left behind and reported to the shop by design and
 * filename, so the shop knows exactly what to ask for. It is never a reason to
 * fail the submission — see isArtworkTooLargeToAttach.
 *
 * None of this applies when a blob store is connected: those files never enter
 * the request body at all.
 */
export const MAX_INLINE_ARTWORK_TOTAL_BYTES = 3.5 * 1024 * 1024;

/**
 * Room kept clear for everything in the body that is not a file: the order
 * JSON, the artwork analysis, the dropped-file list and the multipart
 * scaffolding. Nothing gets to spend this.
 */
export const BODY_RESERVED_FOR_FIELDS_BYTES = 0.3 * 1024 * 1024;

/**
 * What is left of the request body once `bytesUsed` has been claimed.
 *
 * The proofs we render ride in the same body as the customer's artwork, and
 * the ceiling being shared is the platform's, not each part's. One proof fit
 * beside a full artwork budget by luck; three would not, and going over does
 * not lose a picture — it kills the request at the edge and loses the ORDER.
 *
 * Artwork claims its budget first and proofs take what remains, because the
 * customer's own file is the one thing that cannot be regenerated.
 */
export function remainingInlineBudget(bytesUsed: number) {
  return Math.max(
    0,
    PLATFORM_BODY_LIMIT_BYTES - BODY_RESERVED_FOR_FIELDS_BYTES - bytesUsed
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Too big to travel with the quote.
 *
 * NOT a rejection of the order. An oversized file must never block the quote
 * from being submitted — the quote goes through without the attachment and the
 * shop asks for the file directly. Losing the attachment is a nuisance; losing
 * the order is not acceptable.
 */
export function isArtworkTooLargeToAttach(
  // Anything carrying a byte count, not strictly a File. The planner in
  // lib/attachment-plan works in sizes so it can be tested without a browser,
  // and it must ask this question rather than re-deriving the rule — a second
  // copy of "is it too big" is how the two come to disagree.
  file: { size: number } | null | undefined
) {
  if (!file) return false;
  return file.size > MAX_ATTACHED_ARTWORK_BYTES;
}

/** Human-readable cap, for customer-facing copy. */
export const MAX_ATTACHED_ARTWORK_LABEL = "3.5 MB";

/**
 * The real ceiling once artwork goes straight to blob storage.
 *
 * A direct-to-blob upload never passes through a serverless function, so the
 * 4.4 MB body limit above simply does not apply to it. This is the number the
 * customer should see whenever a blob store is connected.
 */
export const MAX_BLOB_ARTWORK_BYTES = 100 * 1024 * 1024;
export const MAX_BLOB_ARTWORK_LABEL = "100 MB";

/**
 * MULTIPART IS OFF, AND THIS IS WHY IT IS A CONSTANT RATHER THAN A DELETION.
 *
 * Above this size the client would upload in parallel chunks instead of one
 * request. It is set past MAX_BLOB_ARTWORK_BYTES, so nothing reaches it and
 * every file goes as a single PUT.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * The client-upload path is presigned now (see app/api/artwork-upload),
 * and multipart does not survive that route in @vercel/blob 2.7.0.
 * handleUploadPresigned takes the caller's `multipart` flag, hands it to
 * getSignedToken — and then never passes it to presign:
 *
 *     const presignedUrlPayload = await presign(token, {
 *       ...urlOptionsWithCallback, operation: "put", pathname
 *     });                                  // client.js:347
 *
 * `operation` is always "put", and PresignPutUrlOptions omits `operation`
 * entirely, so there is no supported way to return the presigned POST to
 * /mpu that the SDK's own docs say multipart requires.
 *
 * ── WHAT IT COSTS ─────────────────────────────────────────────────────────
 * Parallel chunking with per-chunk retry, so a dropped connection restarts
 * the upload instead of resuming one chunk. Multipart earns that complexity
 * at hundreds of megabytes; this shop's ceiling is 100 MB and its real
 * files are tens. The stall guard in lib/artwork-upload.ts already ends a
 * dead connection in 30 seconds, so the failure mode is unchanged — it
 * costs a restart on a genuinely flaky line.
 *
 * ── WHAT IT BUYS ──────────────────────────────────────────────────────────
 * ONE code path for every size. A 5 MB file and a 20 MB file used to differ
 * in how they uploaded, which meant a passing test at 5 MB said nothing
 * about 20 MB. Now testing any size tests them all.
 *
 * Restoring multipart means verifying it end to end against a real store
 * first — not flipping this number back.
 */
export const MULTIPART_THRESHOLD_BYTES = Number.POSITIVE_INFINITY;

/**
 * Where a client upload is allowed to write.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * /api/artwork-upload mints a write token for the browser, and it is public
 * by necessity: a customer uploading artwork has no account and no session.
 * The only thing standing between that endpoint and the shop's blob store is
 * what the token is scoped to.
 *
 * It was scoped to a size and nothing else. `onBeforeGenerateToken` receives
 * the requested pathname and the route ignored it, so the endpoint would mint
 * a token for ANY path the caller asked for — 100 MB at a time, unlimited
 * files, into a publicly-served store. That is the shop's storage bill and the
 * shop's domain serving whatever somebody chose to put there.
 *
 * It also made the hand-off token's security story decorative. lib/handoff.ts
 * describes that token as the capability that scopes an upload to one prefix;
 * nothing was checking it.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * Two shapes are legitimate and nothing else is:
 *
 *   quote-artwork/<file>          the quote form
 *   handoff/<token>/<file>        a customer's phone, token shape enforced
 *   dropoff/<token>/<file>        the drop-off station, token shape enforced
 *
 * One segment after the prefix, so the store cannot be used as a tree. No
 * traversal, no absolute paths, no control characters — the pathname becomes
 * a blob key, and "../" in a key is how one prefix reaches another.
 *
 * Deliberately NOT a content-type check. See the note in the route: print
 * artwork arrives with unreliable MIME (Windows Chrome reports "" for .eps),
 * and an allowlist would reject the files this shop is sent most.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const QUOTE_ARTWORK_PREFIX = "quote-artwork/";

export function isAllowedUploadPath(pathname: unknown): pathname is string {
  if (typeof pathname !== "string") return false;

  /**
   * THE VALUE CHECKED MUST BE THE VALUE WRITTEN.
   *
   * This used to `.trim()` and validate the result, while the caller went
   * on to sign and write the ORIGINAL. A pathname of " quote-artwork/x.png"
   * — one leading space — therefore passed a guard whose entire job is to
   * confine writes to two prefixes, and produced a presigned PUT for the
   * key " quote-artwork/x.png", which is in neither of them. Any leading or
   * trailing space, tab, newline or BOM did it.
   *
   * Rejected rather than trimmed here, deliberately. Trimming would make
   * this function return true for a string the caller must then remember to
   * normalise the same way — the exact split that caused the hole. A
   * pathname with whitespace on either end is not a filename anyone meant
   * to send, so there is nothing to salvage.
   *
   * The length cap below is now applied to the real value too. It was
   * measured against the trimmed one, so the string actually written was
   * bounded only by the SDK's own limit.
   */
  if (pathname !== pathname.trim()) return false;

  const path = pathname;

  // A blob key long enough to be a problem is not a filename.
  if (!path || path.length > 400) return false;

  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\u0000-\u001f]/.test(path)
  ) {
    return false;
  }

  // Traversal is a check on SEGMENTS, not on the characters. A blanket ban on
  // ".." anywhere would also reject "logo..png", and this module's whole
  // posture is that a false negative costs a real customer their upload.
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    return false;
  }

  if (path.startsWith(QUOTE_ARTWORK_PREFIX)) {
    const file = path.slice(QUOTE_ARTWORK_PREFIX.length);
    return file.length > 0 && !file.includes("/");
  }

  const handoff = /^handoff\/([^/]+)\/([^/]+)$/.exec(path);

  // The token shape is asked of lib/handoff.ts rather than re-encoded here.
  // Two copies of "what a hand-off token looks like" is how the check and the
  // generator come to disagree.
  if (handoff) return isValidHandoffToken(handoff[1]);

  /**
   * The drop-off station. A THIRD named shape, not a loosening of the two
   * above: same one-segment-after-the-prefix rule, same traversal ban, and
   * the token shape asked of the module that mints it.
   *
   * Shape is all this can check. Whether the signature is good — and so
   * whether the session is real and unexpired — is decided by
   * readDropoffToken on the routes that act on a session. A shape-valid
   * token with a bad signature can put a file in a prefix nobody is
   * listening to and reach nothing else: /api/dropoff/files and
   * /api/dropoff/done both verify the signature before they answer.
   */
  const dropoff = /^dropoff\/([^/]+)\/([^/]+)$/.exec(path);

  if (dropoff) return isDropoffTokenShape(dropoff[1]);

  return false;
}
