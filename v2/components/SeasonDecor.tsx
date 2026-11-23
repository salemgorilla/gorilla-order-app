/**
 * Christmas decor (Gabe, 2026-11-23: "I would like some holiday decor also,
 * for Christmas theme. Holly, bells, snowflakes.").
 *
 * Everything here is inline SVG, decorative and hidden from assistive tech,
 * and ships in the markup all year: globals.css shows it only under
 * html[data-theme="christmas"] (lib/season.ts sets that before first paint),
 * so outside December it is display:none and costs nothing to draw. None of
 * it takes pointer events, so it can never sit between a customer and a
 * control. Colours come from the --decor-* tokens in globals.css.
 */

/** A holly sprig: two spiky leaves and three berries. */
export function Holly({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 48"
      className={`xmas-decor pointer-events-none ${className}`}
    >
      {/* Left leaf, pointing down-left. */}
      <path
        className="fill-[var(--decor-leaf)]"
        d="M30 22 C26 20 22 17 19 20 L14 18 L15 23 L9 24 L12 28 L7 31 L13 33 L11 38 L17 37 L19 42 C24 36 29 30 30 22 Z"
      />
      {/* Right leaf, pointing down-right. */}
      <path
        className="fill-[var(--decor-leaf-dark)]"
        d="M34 22 C38 20 42 17 45 20 L50 18 L49 23 L55 24 L52 28 L57 31 L51 33 L53 38 L47 37 L45 42 C40 36 35 30 34 22 Z"
      />
      {/* Leaf veins. */}
      <path
        className="fill-none stroke-[var(--decor-vein)]"
        strokeWidth="1"
        d="M30 23 C26 29 22 35 18 40 M34 23 C38 29 42 35 46 40"
      />
      <circle className="fill-[var(--decor-berry)]" cx="28" cy="18" r="5" />
      <circle className="fill-[var(--decor-berry)]" cx="36" cy="18" r="5" />
      <circle className="fill-[var(--decor-berry)]" cx="32" cy="11" r="5" />
      <circle className="fill-[var(--decor-shine)]" cx="26.5" cy="16.5" r="1.4" />
      <circle className="fill-[var(--decor-shine)]" cx="34.5" cy="16.5" r="1.4" />
      <circle className="fill-[var(--decor-shine)]" cx="30.5" cy="9.5" r="1.4" />
    </svg>
  );
}

/** Two gold bells tied with a red bow. */
export function Bells({ className = "" }: { className?: string }) {
  const bell =
    "M0 -14 C-6 -14 -9 -9 -9 -2 C-9 4 -11 7 -14 9 L14 9 C11 7 9 4 9 -2 C9 -9 6 -14 0 -14 Z";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 48"
      className={`xmas-decor pointer-events-none ${className}`}
    >
      <g transform="translate(21 26) rotate(-16)">
        <path className="fill-[var(--decor-gold)] stroke-[var(--decor-gold-dark)]" strokeWidth="1.2" d={bell} />
        <circle className="fill-[var(--decor-gold-dark)]" cx="0" cy="11.5" r="3" />
      </g>
      <g transform="translate(43 26) rotate(16)">
        <path className="fill-[var(--decor-gold)] stroke-[var(--decor-gold-dark)]" strokeWidth="1.2" d={bell} />
        <circle className="fill-[var(--decor-gold-dark)]" cx="0" cy="11.5" r="3" />
      </g>
      {/* The bow where they hang. */}
      <path className="fill-[var(--decor-berry)]" d="M32 8 L22 2 L23 13 Z M32 8 L42 2 L41 13 Z" />
      <circle className="fill-[var(--decor-berry)]" cx="32" cy="8" r="3.2" />
    </svg>
  );
}

/** One six-armed snowflake, drawn once and reused. */
function Flake() {
  const arm = "M0 0 L0 -10 M0 -6 L-3 -9 M0 -6 L3 -9 M0 -3 L-2 -5 M0 -3 L2 -5";
  return (
    <svg viewBox="-12 -12 24 24" className="h-full w-full">
      <g className="fill-none stroke-[var(--decor-snow)]" strokeWidth="1.6" strokeLinecap="round">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <path key={deg} d={arm} transform={`rotate(${deg})`} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Where each flake sits and how it falls. Fixed so the pattern is the same
 * on the server and in the browser (no hydration mismatch, no layout shift).
 * x and y are the resting place for reduced-motion visitors, who get a still
 * scatter of snow instead of a falling one.
 */
const FLAKES: Array<{ x: number; y: number; size: number; dur: number; delay: number; drift: number }> = [
  { x: 3, y: 12, size: 14, dur: 16, delay: 0, drift: 30 },
  { x: 11, y: 58, size: 10, dur: 21, delay: -7, drift: -20 },
  { x: 19, y: 30, size: 18, dur: 18, delay: -3, drift: 40 },
  { x: 28, y: 80, size: 11, dur: 24, delay: -12, drift: 25 },
  { x: 37, y: 6, size: 13, dur: 19, delay: -15, drift: -35 },
  { x: 46, y: 44, size: 9, dur: 22, delay: -5, drift: 20 },
  { x: 55, y: 70, size: 16, dur: 17, delay: -10, drift: -25 },
  { x: 64, y: 20, size: 12, dur: 23, delay: -2, drift: 30 },
  { x: 73, y: 52, size: 17, dur: 20, delay: -14, drift: -40 },
  { x: 82, y: 88, size: 10, dur: 25, delay: -8, drift: 20 },
  { x: 90, y: 36, size: 15, dur: 18, delay: -11, drift: -30 },
  { x: 97, y: 64, size: 11, dur: 21, delay: -4, drift: 25 },
];

/**
 * Light snowfall behind the page. A fixed layer at z-index -1, so it shows
 * on the page ground and passes behind every white panel, and it takes no
 * pointer events. Twelve flakes, transform-only animation.
 */
export function Snowfall() {
  return (
    <div aria-hidden="true" className="xmas-snow pointer-events-none">
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="xmas-flake"
          style={
            {
              left: `${f.x}%`,
              "--flake-y": `${f.y}vh`,
              "--flake-drift": `${f.drift}px`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            } as React.CSSProperties
          }
        >
          <Flake />
        </span>
      ))}
    </div>
  );
}
