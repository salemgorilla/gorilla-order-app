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
export function isArtworkTooLargeToAttach(file: File | null | undefined) {
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
// Build marker: blob-token-check-20260807
