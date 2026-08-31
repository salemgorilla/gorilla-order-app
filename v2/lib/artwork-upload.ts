import { upload } from "@vercel/blob/client";

import {
  MULTIPART_THRESHOLD_BYTES,
  MAX_BLOB_ARTWORK_BYTES,
  QUOTE_ARTWORK_PREFIX,
} from "./upload-limits";

/**
 * Send artwork straight from the browser to blob storage.
 *
 * Returns the blob URL, or — when the direct path could not be used — null
 * plus a REASON, in which case the caller falls back to putting the file in
 * the quote request itself.
 *
 * WHY THIS EXISTS: a serverless function request body is capped at ~4.4 MB by
 * the platform, below the size of most press-ready files. This path never
 * touches a function, so that cap does not apply.
 *
 * WHY IT NEVER THROWS: an upload problem must not cost the shop the order.
 * Every failure resolves, and the quote still goes out — with the file
 * inline if it is small enough, or flagged for collection if it is not. A
 * lost attachment is a nuisance; a lost order is not.
 *
 * WHY IT NAMES ITS FAILURE: on 25 Aug a customer's 10.6 MB apparel artwork
 * fell through this fallback and was dropped, and nothing anywhere recorded
 * WHY the direct path failed — this function swallowed the error into a
 * console.warn nobody can read after the tab closes. By the time anyone
 * looked, the function logs had expired and the cause was unattributable.
 * The reason now rides with the quote, so the next failure is a line in the
 * shop's email and the server log instead of a mystery.
 *
 * WHY THE STALL GUARD: the SDK retries a dead connection roughly ten times
 * with backoff — measured at over two minutes in a browser before it gives
 * up — while the customer watches a spinner. Aborting after a stretch of no
 * progress turns that into a quick, recorded fallback. Keyed to PROGRESS,
 * not total time, so a slow-but-moving 100 MB upload is never killed.
 */

export type ArtworkUploadResult = {
  url: string | null;
  /** Why the direct path failed, when it did. Null on success. */
  failure: string | null;
};

/** No progress for this long means the connection is dead, not slow. */
export const UPLOAD_STALL_MS = 30_000;

/**
 * An AbortSignal that fires after `stallMs` without NEW progress.
 *
 * Exported for tests: the stall rule is the part that must not regress —
 * a guard that never fires re-creates the two-minute spinner, and one that
 * fires through pokes kills slow real uploads.
 *
 * Two hard-won details, both found by running the black-hole case:
 *
 *   MONOTONIC. The SDK fires a 0%-progress event at the START of every
 *   retry attempt, so a naive reset-on-any-event guard is re-armed by the
 *   very retry storm it exists to end. Only bytes beyond the highest seen
 *   so far count as progress.
 *
 *   A PROMISE, not just a signal. The abort signal is handed to the SDK as
 *   a request, not a guarantee — a retry loop can swallow the AbortError
 *   and go around again. `expired` rejects on stall, and the caller RACES
 *   the upload against it, so the fallback runs on time whatever the SDK
 *   does with the signal.
 */
export function createStallGuard(stallMs: number) {
  const controller = new AbortController();
  let timer = setTimeout(abort, stallMs);
  let highWater = 0;
  let rejectExpired: (reason: Error) => void;

  const expired = new Promise<never>((_, reject) => {
    rejectExpired = reject;
  });

  function abort() {
    const reason = new Error(
      `no upload progress for ${Math.round(stallMs / 1000)}s`
    );
    controller.abort(reason);
    rejectExpired(reason);
  }

  return {
    signal: controller.signal,
    /** Rejects when the stall fires; race the upload against it. */
    expired,
    /** Report progress; only NEW bytes reset the clock. */
    poke(loadedBytes: number) {
      if (loadedBytes <= highWater) return;
      highWater = loadedBytes;
      clearTimeout(timer);
      if (!controller.signal.aborted) timer = setTimeout(abort, stallMs);
    },
    /** Call when the upload settles, so the timer cannot outlive it. */
    settle() {
      clearTimeout(timer);
    },
  };
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
    return `${name}${error.message}`.slice(0, 300);
  }
  return String(error).slice(0, 300);
}

export async function uploadArtworkToBlob(
  file: File,
  onProgress?: (percentage: number | null) => void
): Promise<ArtworkUploadResult> {
  if (!file) return { url: null, failure: "no file" };

  if (file.size > MAX_BLOB_ARTWORK_BYTES) {
    return { url: null, failure: "file exceeds the 100 MB direct-upload cap" };
  }

  const stall = createStallGuard(UPLOAD_STALL_MS);

  try {
    // Prefixed so the authorising route can tell a legitimate quote upload
    // from an arbitrary path somebody asked for — see isAllowedUploadPath.
    // A bare filename is indistinguishable from anything else.
    const uploadPromise = upload(`${QUOTE_ARTWORK_PREFIX}${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/artwork-upload",
      // Big files go up in parallel chunks with per-chunk retry, so one
      // flaky moment on a shop's connection does not restart a 60 MB
      // upload.
      multipart: file.size > MULTIPART_THRESHOLD_BYTES,
      abortSignal: stall.signal,
      onUploadProgress: ({ loaded, percentage }) => {
        stall.poke(loaded);
        onProgress?.(percentage);
      },
    });

    // When the stall wins the race, the losing upload promise still rejects
    // later (with the AbortError) — observed here so it cannot surface as an
    // unhandled rejection after we have already moved on.
    uploadPromise.catch(() => {});

    const result = await Promise.race([uploadPromise, stall.expired]);

    return { url: result.url, failure: null };
  } catch (error) {
    // Includes the 501 from the token route when no blob store is connected
    // — an expected state on a bare deployment, and now a NAMED one.
    const failure = stall.signal.aborted
      ? describeFailure(stall.signal.reason)
      : describeFailure(error);

    console.warn(`Direct artwork upload unavailable (${failure}), falling back.`);

    return { url: null, failure };
  } finally {
    stall.settle();
    onProgress?.(null);
  }
}
