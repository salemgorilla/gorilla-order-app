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

/** Above this the file is uploaded in parallel chunks rather than one request. */
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

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

  const path = pathname.trim();

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

  return false;
}
