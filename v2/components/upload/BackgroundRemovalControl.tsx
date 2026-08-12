"use client";

type Props = {
  /** What the customer asked for. Flips the moment they click. */
  active: boolean;
  /** Whether the knockout actually exists yet. Gates the before/after only. */
  ready: boolean;
  busy: boolean;
  error?: string;
  originalUrl: string | null;
  knockoutUrl: string | null;
  onToggle: (wanted: boolean) => void;
};

/**
 * Order Desk — offer to knock the background out of a die-cut design.
 *
 * Shown only when we have looked at the file and found a solid background on
 * a die cut, which is the one case where it changes what gets made. It is a
 * real checkbox, unticked, because this edits the customer's artwork and that
 * is never something to do on their behalf and mention afterwards.
 *
 * The before/after is the whole point of the control. Automated matting is
 * good on flat backgrounds and wrong on some files, and the only person who
 * can tell which is the one who made the artwork.
 */
export default function BackgroundRemovalControl({
  active,
  ready,
  busy,
  error,
  originalUrl,
  knockoutUrl,
  onToggle,
}: Props) {
  return (
    <div className="mt-3 border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-4">
      <p className="text-sm font-bold leading-5 text-[var(--ink-warn)]">
        This file has a solid background, so a die cut would follow the edge of
        the image — a rectangle, not the shape of your design.
      </p>

      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={active}
          disabled={busy}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--gorilla-green)]"
        />
        <span>
          <span className="block text-sm font-bold text-[var(--ink-black)]">
            Remove the background for me
          </span>
          <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
            We&rsquo;ll cut the background away so the sticker follows the shape
            of your design. Check the result below — Gorilla Salem reviews it
            and sends a proof before anything prints either way.
          </span>
        </span>
      </label>

      {busy && (
        <p className="mt-3 text-sm font-bold text-[var(--ink-muted)]">
          Removing the background…
        </p>
      )}

      {/* A failure has to say which failure. "We couldn't" leaves the customer
          with nothing to do; "your background isn't one flat colour" tells
          them their photo was never going to work here. */}
      {error && (
        <p className="mt-3 bg-[var(--paper)] p-3 text-sm font-bold leading-5 text-[var(--ink-warn)]">
          {error}
        </p>
      )}

      {active && ready && knockoutUrl && originalUrl && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Swatch label="You sent" url={originalUrl} checker={false} />
            <Swatch label="We'll cut" url={knockoutUrl} checker />
          </div>
          <p className="mt-2 text-fine text-[var(--ink-muted)]">
            The chequered area is what gets cut away. White INSIDE your design
            is kept — that part is vinyl on the finished sticker.
          </p>
        </div>
      )}
    </div>
  );
}

function Swatch({
  label,
  url,
  checker,
}: {
  label: string;
  url: string;
  checker: boolean;
}) {
  return (
    <figure>
      <figcaption className="mb-1 text-fine font-bold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
        {label}
      </figcaption>
      <div
        className="flex h-32 items-center justify-center border border-[var(--rule)] bg-[var(--paper)] p-2"
        // A chequerboard is the one convention every customer already reads as
        // "nothing here", and it is the only way a transparent PNG can be told
        // apart from a white one on a pale page.
        style={
          checker
            ? {
                backgroundImage:
                  "linear-gradient(45deg,#d8d2c4 25%,transparent 25%),linear-gradient(-45deg,#d8d2c4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d8d2c4 75%),linear-gradient(-45deg,transparent 75%,#d8d2c4 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
              }
            : undefined
        }
      >
        {/* next/image needs a known host or loader for a blob: URL, and this
            is a transient object URL for a file the customer just picked. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label === "You sent" ? "Your artwork as uploaded" : "Your artwork with the background removed"}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </figure>
  );
}
