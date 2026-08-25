import type { GarmentZone } from "./garment-zones";

/**
 * The arithmetic behind /calibrate — the staff page where a human drags a box
 * over a garment photograph and reads off the numbers for lib/garment-zones.ts.
 *
 * ── WHY A PAGE AND NOT A SCRIPT ───────────────────────────────────────────
 * The zone table's contract says verified means "a human has checked these
 * numbers against the style's actual photo and spot-checked the composite on
 * screen". Nothing server-side can meet that bar, and the photographs live on
 * S&S's host — which the customer's browser already loads every day, and
 * which is exactly where the calibration view loads them from too. So the
 * tool is a browser page, and this module is the part of it that can be
 * tested without one: pure fraction arithmetic, no DOM.
 *
 * All coordinates are fractions of the photograph (0..1), the same space as
 * GarmentZone itself. `verified` is deliberately absent here — flipping it
 * is a decision made in the code review, not by the drag handler.
 */

export type CalibrationZone = Pick<
  GarmentZone,
  "centerX" | "top" | "width" | "maxHeight"
>;

/** Below this the box is untouchably small; it is a floor, not a suggestion. */
const MIN_SIZE = 0.04;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * Keep the whole box on the photograph. Order matters: size first, then
 * position against that size — clamping position against a stale size lets
 * one drag push the box half off the edge.
 */
export function clampZone(zone: CalibrationZone): CalibrationZone {
  const width = clamp(zone.width, MIN_SIZE, 1);
  const maxHeight = clamp(zone.maxHeight, MIN_SIZE, 1);

  return {
    width,
    maxHeight,
    centerX: clamp(zone.centerX, width / 2, 1 - width / 2),
    top: clamp(zone.top, 0, 1 - maxHeight),
  };
}

/** Drag on the box body: move, clamped to the photo. Deltas are fractions. */
export function moveZone(
  zone: CalibrationZone,
  dx: number,
  dy: number
): CalibrationZone {
  return clampZone({ ...zone, centerX: zone.centerX + dx, top: zone.top + dy });
}

/**
 * Drag on the corner handle: resize. Width grows symmetrically about the
 * centreline (2·dx) because the print area is centred by definition — the
 * compositor draws from centerX out, so an off-centre resize would lie about
 * what will render. Height grows downward from the fixed top edge.
 */
export function resizeZone(
  zone: CalibrationZone,
  dx: number,
  dy: number
): CalibrationZone {
  return clampZone({
    ...zone,
    width: zone.width + dx * 2,
    maxHeight: zone.maxHeight + dy,
  });
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** "0.5" reads as sloppy in a measured table; "0.500" says somebody looked. */
const fraction = (value: number) => round3(value).toFixed(3);

/**
 * The paste-ready lines for one side of one style, in exactly the shape
 * garment-zones.ts holds them. `verified: true` is printed because the person
 * copying this snippet IS the human the contract requires — the page only
 * offers the copy button next to the composite they are looking at.
 */
export function formatZoneSnippet(
  side: "front" | "back",
  zone: CalibrationZone
): string {
  return [
    `${side}: {`,
    `  verified: true,`,
    `  centerX: ${fraction(zone.centerX)},`,
    `  top: ${fraction(zone.top)},`,
    `  width: ${fraction(zone.width)},`,
    `  maxHeight: ${fraction(zone.maxHeight)},`,
    `},`,
  ].join("\n");
}

/**
 * The whole style block once both sides are saved — what actually gets pasted
 * into garmentZones. Sides not yet saved are left out rather than invented.
 */
export function formatStyleSnippet(
  style: string,
  sides: Partial<Record<"front" | "back", CalibrationZone>>
): string {
  const parts = (["front", "back"] as const)
    .filter((side) => sides[side])
    .map((side) =>
      formatZoneSnippet(side, sides[side] as CalibrationZone)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")
    );

  return [`"${style}": {`, ...parts, `},`].join("\n");
}
