import { THANKSGIVING_TAG } from "../lib/season";

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
      <circle className="fill-[var(--decor-berry)] stroke-[var(--decor-berry-edge)]" strokeWidth="1.3" cx="28" cy="18" r="5" />
      <circle className="fill-[var(--decor-berry)] stroke-[var(--decor-berry-edge)]" strokeWidth="1.3" cx="36" cy="18" r="5" />
      <circle className="fill-[var(--decor-berry)] stroke-[var(--decor-berry-edge)]" strokeWidth="1.3" cx="32" cy="11" r="5" />
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
  { x: 3, y: 12, size: 20, dur: 16, delay: 0, drift: 30 },
  { x: 11, y: 58, size: 14, dur: 21, delay: -7, drift: -20 },
  { x: 19, y: 30, size: 25, dur: 18, delay: -3, drift: 40 },
  { x: 28, y: 80, size: 15, dur: 24, delay: -12, drift: 25 },
  { x: 37, y: 6, size: 18, dur: 19, delay: -15, drift: -35 },
  { x: 46, y: 44, size: 13, dur: 22, delay: -5, drift: 20 },
  { x: 55, y: 70, size: 22, dur: 17, delay: -10, drift: -25 },
  { x: 64, y: 20, size: 17, dur: 23, delay: -2, drift: 30 },
  { x: 73, y: 52, size: 24, dur: 20, delay: -14, drift: -40 },
  { x: 82, y: 88, size: 14, dur: 25, delay: -8, drift: 20 },
  { x: 90, y: 36, size: 21, dur: 18, delay: -11, drift: -30 },
  { x: 97, y: 64, size: 15, dur: 21, delay: -4, drift: 25 },
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

/* ---------------------------------------------------------------------------
 * Thanksgiving leaves (Gabe, 2026-11-23: "Can we add like fall colored leaves
 * drifting and falling down?"). Same approach as the snow: inline SVG on a
 * fixed layer behind the page, no pointer events, aria-hidden, shown only
 * under html[data-theme="thanksgiving"], still for reduced-motion visitors.
 * ------------------------------------------------------------------------- */

/** Two leaf shapes, drawn on a 24x24 grid with the stem at the bottom. */
const LEAF_SHAPES = {
  // A five-lobed maple leaf.
  maple:
    "M12 2 L13.6 6.2 L16.8 4.8 L16 8.8 L20.6 8.2 L18.4 11.6 L21.4 13 L16.8 14.6 L17.6 17 L13 15.8 L12.6 19.6 L11.4 19.6 L11 15.8 L6.4 17 L7.2 14.6 L2.6 13 L5.6 11.6 L3.4 8.2 L8 8.8 L7.2 4.8 L10.4 6.2 Z",
  // A plain oval leaf with a point.
  oval: "M12 2 C17 6 18 12 12 19.6 C6 12 7 6 12 2 Z",
} as const;

const LEAF_FILLS = [
  "fill-[var(--leaf-pumpkin)]",
  "fill-[var(--leaf-cranberry)]",
  "fill-[var(--leaf-gold)]",
  "fill-[var(--leaf-brown)]",
] as const;

function Leaf({ shape, fill }: { shape: keyof typeof LEAF_SHAPES; fill: number }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full">
      <path className={LEAF_FILLS[fill]} d={LEAF_SHAPES[shape]} />
      {/* Stem and centre vein. */}
      <path
        className="fill-none stroke-[var(--leaf-vein)]"
        strokeWidth="0.9"
        strokeLinecap="round"
        d="M12 6 L12 22"
      />
    </svg>
  );
}

/** Fixed positions, as with the snow: x/y are the resting place for
 *  reduced-motion visitors. Ten leaves. */
const LEAVES: Array<{
  x: number;
  y: number;
  size: number;
  dur: number;
  delay: number;
  shape: keyof typeof LEAF_SHAPES;
  fill: number;
}> = [
  { x: 4, y: 18, size: 26, dur: 17, delay: 0, shape: "maple", fill: 0 },
  { x: 14, y: 66, size: 20, dur: 21, delay: -9, shape: "oval", fill: 2 },
  { x: 24, y: 34, size: 28, dur: 19, delay: -4, shape: "maple", fill: 1 },
  { x: 35, y: 84, size: 22, dur: 23, delay: -13, shape: "oval", fill: 3 },
  { x: 47, y: 10, size: 24, dur: 18, delay: -7, shape: "maple", fill: 2 },
  { x: 58, y: 52, size: 20, dur: 22, delay: -16, shape: "oval", fill: 0 },
  { x: 68, y: 26, size: 30, dur: 20, delay: -2, shape: "maple", fill: 3 },
  { x: 78, y: 74, size: 22, dur: 24, delay: -11, shape: "oval", fill: 1 },
  { x: 88, y: 42, size: 26, dur: 19, delay: -6, shape: "maple", fill: 0 },
  { x: 96, y: 88, size: 20, dur: 21, delay: -14, shape: "oval", fill: 2 },
];

/** Leaves drifting down behind the page. The outer span falls; the inner
 *  one sways side to side and tumbles, so the drift looks like a leaf rather
 *  than a stone. Transform-only animation. */
export function LeafFall() {
  return (
    <div aria-hidden="true" className="fall-leaves pointer-events-none">
      {LEAVES.map((l, i) => (
        <span
          key={i}
          className="fall-leaf"
          style={
            {
              left: `${l.x}%`,
              "--leaf-y": `${l.y}vh`,
              width: `${l.size}px`,
              height: `${l.size}px`,
              animationDuration: `${l.dur}s`,
              animationDelay: `${l.delay}s`,
            } as React.CSSProperties
          }
        >
          <span
            className="fall-leaf-sway"
            style={{ animationDuration: `${(l.dur / 4).toFixed(2)}s`, animationDelay: `${l.delay}s` }}
          >
            <Leaf shape={l.shape} fill={l.fill} />
          </span>
        </span>
      ))}
    </div>
  );
}

/** A small pumpkin with a stem and a curl of vine, for beside the wordmark
 *  in the Thanksgiving theme. */
export function Pumpkin({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 44"
      className={`fall-decor pointer-events-none ${className}`}
    >
      {/* Body: three overlapping lobes, darkest at the back. */}
      <ellipse className="fill-[var(--pumpkin-dark)]" cx="14" cy="28" rx="11" ry="13" />
      <ellipse className="fill-[var(--pumpkin-dark)]" cx="34" cy="28" rx="11" ry="13" />
      <ellipse className="fill-[var(--leaf-pumpkin)]" cx="24" cy="28" rx="12" ry="14" />
      {/* Ribs. */}
      <path
        className="fill-none stroke-[var(--pumpkin-dark)]"
        strokeWidth="1.2"
        d="M19 16 C16 24 16 33 19 41 M29 16 C32 24 32 33 29 41"
      />
      {/* Stem, leaf and vine curl. */}
      <path className="fill-[var(--leaf-brown)]" d="M22 16 L22.5 7 C23 5 26 5 26.5 7 L26 16 Z" />
      <path className="fill-[var(--pumpkin-leaf)]" d="M26 9 C31 4 38 6 39 10 C34 13 29 13 26 9 Z" />
      <path
        className="fill-none stroke-[var(--pumpkin-leaf)]"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M22 9 C18 5 14 8 16 11 C18 13 20 10 18 9"
      />
    </svg>
  );
}

/** A slim greeting above the header, Thanksgiving theme only. Real text, so
 *  it is read out like any other line when it shows. */
export function ThanksgivingBanner() {
  return (
    <p className="fall-banner spec text-spec font-bold uppercase tracking-eyebrow">
      <span>Happy Thanksgiving from Gorilla</span>
      {/* The placeholder deal tag; its words live in lib/season.ts. */}
      {THANKSGIVING_TAG && (
        <a href="/deals" className="fall-tag">
          {THANKSGIVING_TAG}
        </a>
      )}
    </p>
  );
}
