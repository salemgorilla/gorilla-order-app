import type { DesignTemplate } from "../lib/templates";

type Props = {
  template: DesignTemplate;
  values: Record<string, string>;
  className?: string;
  /**
   * The "preview only" note. Off for the picker thumbnails — repeating it on
   * every tile turns a necessary caveat into wallpaper nobody reads.
   */
  showCaption?: boolean;
};

/**
 * Order Desk — live preview of a personalised template.
 *
 * SVG rather than canvas or divs: it scales to any sign size without going
 * soft, the text stays real text (selectable, and readable by a screen
 * reader), and there is nothing to rasterise.
 *
 * This is a PREVIEW, not the print file. The shop drops the customer's words
 * into the master artwork it already owns — see the note at the top of
 * lib/templates.ts. Nothing here is measured for production.
 */
export default function TemplatePreview({
  template,
  values,
  className = "",
  showCaption = false,
}: Props) {
  // Fixed viewBox height with width derived from the aspect, so every
  // fraction in the template resolves against one predictable box.
  const H = 100;
  const W = Math.round(H * template.aspect);

  const lines = template.fields.map((field) => {
    const raw = (values[field.id] ?? field.defaultValue).trim();
    const text = field.uppercase ? raw.toUpperCase() : raw;

    return { field, text };
  });

  const filled = lines.filter((line) => line.text);

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full border border-[var(--rule)]"
        role="img"
        aria-label={
          filled.length
            ? `${template.name} preview reading: ${filled
                .map((line) => line.text)
                .join(", ")}`
            : `${template.name} preview, no text entered yet`
        }
      >
        <rect x="0" y="0" width={W} height={H} fill={template.background} />

        {lines.map(({ field, text }) =>
          text ? (
            <text
              key={field.id}
              x={field.x * W}
              y={field.y * H}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={field.sizePct * H}
              fontWeight={field.weight}
              fill={field.color}
              // The shop's display face. Falls back through the stack rather
              // than pinning a webfont the print master may not use anyway.
              fontFamily="var(--font-display), Helvetica Neue, Arial, sans-serif"
              // Long text shrinks to fit rather than running off the board.
              // maxLength caps it too; this is the belt to that pair of braces.
              textLength={
                text.length > 18 ? Math.min(W * 0.92, text.length * field.sizePct * H * 0.62) : undefined
              }
              lengthAdjust="spacingAndGlyphs"
            >
              {text}
            </text>
          ) : null
        )}
      </svg>

      {/* Says what it is. A customer who thinks this IS the artwork will not
          check the proof the shop sends, which is the one that matters. */}
      {showCaption && (
        <p className="mt-2 text-fine text-[var(--ink-muted)]">
          Preview only — Gorilla Salem sets your words into the finished
          artwork and sends a proof before anything prints.
        </p>
      )}
    </div>
  );
}
