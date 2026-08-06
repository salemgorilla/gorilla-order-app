"use client";

import { useRef, useState } from "react";

import {
  formatBytes,
  MAX_ATTACHED_ARTWORK_BYTES,
  MAX_ATTACHED_ARTWORK_LABEL,
  MAX_BLOB_ARTWORK_BYTES,
  MAX_BLOB_ARTWORK_LABEL,
} from "../../lib/upload-limits";

type Props = {
  onFileSelected: (file: File) => void;
  /** The file already chosen, if any. Null shows the empty state. */
  fileName?: string | null;
  /** Object URL for a thumbnail, when the file is an image. */
  previewUrl?: string | null;
  /** Byte size of the chosen file, used to warn before submit. */
  fileSizeBytes?: number | null;
  /**
   * True once a blob store is connected, which lifts the ceiling from the
   * ~4.4 MB function body limit to 100 MB. Until then the box must keep
   * telling the truth about the smaller cap.
   */
  directUploadEnabled?: boolean;
};

/**
 * Order Desk — artwork upload.
 *
 * WHY THIS IS NOT A <label> WRAPPING THE DROP ZONE:
 *
 * It used to be, and drag and drop did not work on desktop. Dropping a file
 * onto a label that contains a file input makes the browser forward the drop
 * to that input as its default action — and the input was `display: none`, so
 * the forwarding silently did nothing and the file never arrived.
 *
 * Now the drop zone is a plain div that owns the drop, and the picker is
 * opened explicitly through a ref. The two paths no longer fight.
 *
 * AND WHY IT SHOWS THE CHOSEN FILE:
 *
 * Fixing the drop was not enough. The box took only `onFileSelected`, so it
 * had no idea a file had ever arrived and kept rendering "Upload Your
 * Artwork" afterwards. The upload worked; it just looked like it hadn't —
 * which is indistinguishable from broken, and got reported as broken twice.
 */
export default function UploadBox({
  onFileSelected,
  fileName = null,
  previewUrl = null,
  fileSizeBytes = null,
  directUploadEnabled = false,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // dragenter/dragleave fire for every child element crossed, so a naive
  // handler flickers the whole time the cursor moves across the panel.
  // Counting enters against leaves is what makes the state stable.
  const dragDepth = useRef(0);

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    onFileSelected(file);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  const ceilingBytes = directUploadEnabled
    ? MAX_BLOB_ARTWORK_BYTES
    : MAX_ATTACHED_ARTWORK_BYTES;

  const ceilingLabel = directUploadEnabled
    ? MAX_BLOB_ARTWORK_LABEL
    : MAX_ATTACHED_ARTWORK_LABEL;

  const isOversized =
    typeof fileSizeBytes === "number" && fileSizeBytes > ceilingBytes;

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        // Required on EVERY dragover or the browser refuses the drop and
        // opens the file in a new tab instead.
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        handleFile(event.dataTransfer?.files?.[0]);
      }}
      onClick={openPicker}
      className={`cursor-pointer border-2 border-dashed p-8 transition ${
        isDragging
          ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
          : "border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--gorilla-green)] hover:bg-[var(--shirt-blank)]"
      }`}
    >
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-5 grid h-20 w-20 place-items-center overflow-hidden bg-[var(--gorilla-green)] text-display text-white">
          {previewUrl && fileName ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span>{isDragging ? "⬇️" : fileName ? "✓" : "📁"}</span>
          )}
        </div>

        <h3 className="text-head font-bold tracking-[-0.03em] text-[var(--ink-black)]">
          {isDragging
            ? "Drop It Here"
            : fileName
            ? "Artwork received"
            : "Upload Your Artwork"}
        </h3>

        {fileName ? (
          <>
            <p className="spec mt-3 max-w-md break-all text-[var(--ink-black)]">
              {fileName}
              {fileSizeBytes ? ` · ${formatBytes(fileSizeBytes)}` : ""}
            </p>
            {isOversized ? (
              <p className="mt-3 max-w-md border-2 border-[var(--rush-red)] px-4 py-3 text-fine text-[var(--rush-red)]">
                Too big to send with this form (limit {ceilingLabel}). Submit
                the quote anyway — we will email you to collect the artwork.
              </p>
            ) : (
              <p className="mt-2 text-fine text-[var(--ink-muted)]">
                Drop another file or click to replace it.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 max-w-md text-[var(--ink-muted)]">
            Drag and drop your artwork here, or click anywhere to browse your
            files.
          </p>
        )}

        <div className="mt-6 bg-white px-6 py-3 text-sm font-bold">
          AI • EPS • PDF • SVG • PNG • JPG
        </div>

        {/* A real button, so the picker is reachable by keyboard. The div's
            click is a convenience for mouse users and is not the only path. */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openPicker();
          }}
          className="mt-8 min-h-[44px] border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-8 py-4 font-bold text-white transition-colors duration-[120ms] ease-linear hover:bg-[var(--paper)] hover:text-[var(--gorilla-green)]"
        >
          {fileName ? "Choose a different file" : "Browse Files"}
        </button>

        {/* This once said 100 MB while the platform rejected anything over
            ~4.4 MB, which is why large print files failed silently. The number
            shown now tracks what the deployment can actually accept. */}
        <p className="mt-4 text-sm text-[var(--ink-muted)]">
          {directUploadEnabled ? (
            <>Maximum file size: {ceilingLabel}</>
          ) : (
            <>
              Files up to {ceilingLabel} upload here. Larger artwork is fine —
              submit the quote and we&rsquo;ll collect it by email.
            </>
          )}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".png,.jpg,.jpeg,.pdf,.svg,.ai,.eps"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          // Reset so choosing the SAME file twice still fires onChange —
          // otherwise a customer who re-picks the file they just removed gets
          // nothing at all.
          event.target.value = "";
        }}
      />
    </div>
  );
}
