import {
  MAX_ATTACHED_ARTWORK_LABEL,
  MAX_BLOB_ARTWORK_LABEL,
} from "../../lib/upload-limits";

type Props = {
  /** True once a blob store is connected, which raises the ceiling to 100 MB. */
  directUploadEnabled?: boolean;
};

/**
 * Order Desk — artwork spec sheet.
 *
 * Sits under the upload box and states two things the customer previously had
 * to find out by failing: how large a file will actually go through, and what
 * makes art printable. Spec furniture, not decoration — every line here is a
 * rule the shop applies at the press.
 */
export default function ArtworkGuidance({
  directUploadEnabled = false,
}: Props) {
  const ceilingLabel = directUploadEnabled
    ? MAX_BLOB_ARTWORK_LABEL
    : MAX_ATTACHED_ARTWORK_LABEL;

  const specs: { label: string; detail: string }[] = [
    {
      label: "BEST",
      detail:
        "Vector art — AI, EPS or PDF. Scales to any size with no quality loss. Convert all fonts to outlines first, or they may reflow on our machine.",
    },
    {
      label: "GOOD",
      detail:
        "PNG or JPG at 300 DPI at the finished print size. A 2\" sticker needs roughly 600 × 600 pixels; a 3' banner needs far more.",
    },
    {
      label: "AVOID",
      detail:
        "Screenshots, images pulled from a website, or anything saved from social media. These are 72 DPI and print soft and pixelated.",
    },
    {
      label: "CUT LINE",
      detail:
        "For a custom die-cut shape, draw the cut path in pure magenta (#FF00FF). We detect it automatically and cut to it.",
    },
    {
      label: "BACKGROUND",
      detail:
        "Stickers print on white vinyl. Save with a transparent background so nothing prints where you do not want ink.",
    },
    {
      label: "COLOR",
      detail:
        "Send CMYK if you have it. RGB files are converted for press, and bright screen colors can shift slightly when they do.",
    },
  ];

  return (
    <section className="mt-6 border border-[var(--rule)] bg-[var(--paper)]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule)] px-5 py-3">
        <h4 className="eyebrow text-[var(--ink-black)]">Artwork Spec</h4>
        <span className="spec text-[var(--ink-muted)]">
          MAX {ceilingLabel.replace(" ", "")}
        </span>
      </header>

      <p className="border-b border-[var(--rule)] px-5 py-3 text-fine text-[var(--ink-muted)]">
        Files up to {ceilingLabel} upload here.
        {directUploadEnabled
          ? " Larger than that, send the quote and email us the file."
          : " Larger artwork is fine — submit the quote and we’ll email you to collect it."}{" "}
        Not sure? Send what you have and we&rsquo;ll tell you if it will print.
      </p>

      <dl className="divide-y divide-[var(--rule)]">
        {specs.map((spec) => (
          // Two columns only once there is room for a readable measure. At
          // 375px the label column left the text about 20 characters wide, so
          // below sm the label stacks above it instead.
          <div
            key={spec.label}
            className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[5.5rem_1fr] sm:gap-4"
          >
            <dt className="spec text-[var(--ink-black)]">{spec.label}</dt>
            <dd className="text-fine text-[var(--ink-muted)]">{spec.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
