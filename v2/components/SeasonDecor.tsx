/**
 * The three places a theme can put decor (lib/theme-calendar.ts names the
 * drawings, lib/theme-decor.ts draws them, lib/season.ts writes the CSS).
 *
 * Each spot is an EMPTY span. The page carries the same markup every day;
 * a theme's stylesheet rule gives the span its drawing as a background
 * image and shows it, and outside a theme that has one the span is
 * display:none. So the only decor a browser ever draws is today's.
 *
 * Decorative only: aria-hidden, no pointer events, and the drift layer sits
 * behind every panel (z-index -1). Visitors who ask for less motion get a
 * still scatter instead of drifting shapes.
 */

import { THANKSGIVING_TAG } from "../lib/season";

/** Beside the GORILLA LABS wordmark (Christmas: bells). */
export function DecorHeader({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`decor-header pointer-events-none ${className}`} />;
}

/** On the corner of a box (Christmas: holly). */
export function DecorCorner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`decor-corner pointer-events-none ${className}`} />;
}

/**
 * Where each drifting shape sits and how it moves. Fixed so the pattern is
 * the same on the server and in the browser (no hydration mismatch, no
 * layout shift). x and y are the resting place for reduced-motion visitors.
 * A theme shows the first `count` of these (DRIFT_MAX in lib/season.ts).
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

/** Light drifting shapes behind the page (Christmas: snow). */
export function DecorDrift() {
  return (
    <div aria-hidden="true" className="decor-drift pointer-events-none">
      {FLAKES.map((f, i) => (
        <span
          key={i}
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
        />
      ))}
    </div>
  );
}

/**
 * A slim greeting above the header, Thanksgiving only (Gabe, 2026-11-23).
 * Hidden by globals.css under every other theme. Real text, so it is read
 * out like any other line when it shows; the tag links to the deals page.
 */
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
