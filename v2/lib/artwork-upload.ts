import { upload } from "@vercel/blob/client";

import {
  MULTIPART_THRESHOLD_BYTES,
  MAX_BLOB_ARTWORK_BYTES,
} from "./upload-limits";

/**
 * Send artwork straight from the browser to blob storage.
 *
 * Returns the blob URL, or null when the upload could not be used — in which
 * case the caller falls back to putting the file in the quote request itself.
 *
 * WHY THIS EXISTS: a serverless function request body is capped at ~4.4 MB by
 * the platform, below the size of most press-ready files. This path never
 * touches a function, so that cap does not apply.
 *
 * WHY IT NEVER THROWS: an upload problem must not cost the shop the order.
 * Every failure resolves to null, and the quote still goes out — with the file
 * inline if it is small enough, or flagged for collection if it is not. A lost
 * attachment is a nuisance; a lost order is not.
 */
export async function uploadArtworkToBlob(
  file: File,
  onProgress?: (percentage: number | null) => void
): Promise<string | null> {
  if (!file || file.size > MAX_BLOB_ARTWORK_BYTES) {
    return null;
  }

  try {
    const result = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/artwork-upload",
      // Big files go up in parallel chunks with per-chunk retry, so one flaky
      // moment on a shop's connection does not restart a 60 MB upload.
      multipart: file.size > MULTIPART_THRESHOLD_BYTES,
      onUploadProgress: onProgress
        ? ({ percentage }) => onProgress(percentage)
        : undefined,
    });

    return result.url;
  } catch (error) {
    // 501 from the token route means no blob store is connected on this
    // deployment. That is an expected state, not a bug — fall back quietly.
    console.warn("Direct artwork upload unavailable, falling back.", error);
    return null;
  } finally {
    onProgress?.(null);
  }
}
