/**
 * EMBROIDERY — placements, and a stitch-count ESTIMATE from the logo's size.
 *
 * Gabe, 2026-11-09: add embroidery to the apparel decorations (left chest,
 * caps/hats, sleeve/other), with an instant estimate and a one-time
 * digitizing fee, and "a thread count calculator" to price it from.
 *
 * ── WHY A CALCULATOR, AND WHY IT IS ONLY AN ESTIMATE ──────────────────────
 * Embroidery is priced by STITCHES, and the real stitch count of a logo does
 * not exist until someone digitizes it: it depends on the file's fills,
 * lettering, underlay and how the digitizer chooses to build each shape. A
 * customer cannot know it, and asking for it would turn a quote into a quiz.
 * So the customer gives what they CAN know, the logo's size and how busy it
 * is, and this turns that into an expected stitch count. The shop confirms
 * the real count after digitizing, exactly as it confirms every apparel
 * estimate (the handoff's language rule: an estimate, never "a price").
 *
 * ── THE ARITHMETIC ────────────────────────────────────────────────────────
 *   stitches = width x height x coverage x STITCHES_PER_SQ_IN x OVERHEAD
 *
 * `coverage` is the share of the logo's bounding box that is actually thread
 * (line art and text are thin; a solid crest is not), `STITCHES_PER_SQ_IN` is
 * the density of a solid fill, and OVERHEAD covers underlay, edge runs and
 * trims that every shape carries. The three constants are ordinary embroidery
 * rules of thumb, NOT the shop's own measurements: a 3.5" x 2" medium logo
 * comes out near 7,000 stitches, which is the right neighbourhood for a left
 * chest design. They are named and exported so the shop can calibrate them
 * against real digitized files, and tests/embroidery-stitches.test.ts pins
 * the worked examples so a change to one is a visible, reviewed change.
 *
 * Nothing here is a price. Prices live in lib/embroidery-pricing-config.ts.
 */

/** Stitches in one square inch of solid fill. A rule of thumb, to calibrate. */
export const STITCHES_PER_SQ_IN = 1800;

/** Underlay, edge runs and trims on top of the fill itself. */
export const STITCH_OVERHEAD = 1.1;

/** Fewer than this and a design is not worth running as a design. */
export const MIN_STITCHES = 1000;

export type EmbroideryComplexity = "light" | "medium" | "dense";

export type EmbroideryComplexityOption = {
  id: EmbroideryComplexity;
  label: string;
  /** What the customer recognises their logo as. */
  blurb: string;
  /** Share of the logo's bounding box that is thread. */
  coverage: number;
};

export const EMBROIDERY_COMPLEXITIES: readonly EmbroideryComplexityOption[] = [
  {
    id: "light",
    label: "Light",
    blurb: "Lettering or thin line art, lots of open space",
    coverage: 0.25,
  },
  {
    id: "medium",
    label: "Medium",
    blurb: "A mix of lettering and filled shapes",
    coverage: 0.5,
  },
  {
    id: "dense",
    label: "Dense",
    blurb: "Mostly solid fills: a crest, mascot or filled badge",
    coverage: 0.85,
  },
] as const;

export type EmbroideryPlacementId = "left-chest" | "cap-front" | "cap-side-back" | "sleeve" | "other";

export type EmbroideryPlacement = {
  id: EmbroideryPlacementId;
  label: string;
  /** The largest design the placement takes, in inches. Bigger is a hand quote. */
  maxWidthInches: number;
  maxHeightInches: number;
  /** Caps and sleeves need different hooping, so the shop may price them apart. */
  isCap: boolean;
  /** What a customer is shown as a starting size. */
  defaultWidthInches: number;
  defaultHeightInches: number;
};

export const EMBROIDERY_PLACEMENTS: readonly EmbroideryPlacement[] = [
  {
    id: "left-chest",
    label: "Left chest",
    maxWidthInches: 4.5,
    maxHeightInches: 4.5,
    isCap: false,
    defaultWidthInches: 3.5,
    defaultHeightInches: 2,
  },
  {
    id: "cap-front",
    label: "Cap front",
    maxWidthInches: 4.5,
    maxHeightInches: 2.25,
    isCap: true,
    defaultWidthInches: 4,
    defaultHeightInches: 2,
  },
  {
    id: "cap-side-back",
    label: "Cap side or back",
    maxWidthInches: 2.5,
    maxHeightInches: 1.5,
    isCap: true,
    defaultWidthInches: 2,
    defaultHeightInches: 1,
  },
  {
    id: "sleeve",
    label: "Sleeve",
    maxWidthInches: 3.5,
    maxHeightInches: 3.5,
    isCap: false,
    defaultWidthInches: 2.5,
    defaultHeightInches: 2.5,
  },
  {
    id: "other",
    label: "Other placement",
    maxWidthInches: 12,
    maxHeightInches: 12,
    isCap: false,
    defaultWidthInches: 4,
    defaultHeightInches: 4,
  },
] as const;

export function embroideryPlacementById(id: unknown): EmbroideryPlacement | undefined {
  return EMBROIDERY_PLACEMENTS.find((placement) => placement.id === id);
}

export function embroideryComplexityById(id: unknown): EmbroideryComplexityOption | undefined {
  return EMBROIDERY_COMPLEXITIES.find((option) => option.id === id);
}

/** What the customer chose for one placement. */
export type EmbroideryDesign = {
  placementId: EmbroideryPlacementId;
  widthInches: number;
  heightInches: number;
  complexity: EmbroideryComplexity;
};

export type StitchEstimate =
  | {
      ok: true;
      /** The expected stitch count, rounded to the nearest hundred. */
      stitches: number;
      /** A plausible spread around it: digitizing decides the real number. */
      low: number;
      high: number;
    }
  | { ok: false; reason: string };

const round100 = (value: number) => Math.round(value / 100) * 100;

/**
 * Expected stitches for one design, or a refusal naming the reason.
 *
 * A design larger than its placement takes, or with a size that is not a
 * positive number, is refused rather than clamped: silently shrinking a
 * 6" logo to fit a left chest would estimate a different logo than the one
 * the customer described.
 */
export function estimateStitches(design: EmbroideryDesign): StitchEstimate {
  const placement = embroideryPlacementById(design.placementId);
  const complexity = embroideryComplexityById(design.complexity);

  if (!placement) return { ok: false, reason: "unknown placement" };
  if (!complexity) return { ok: false, reason: "unknown complexity" };

  const { widthInches: w, heightInches: h } = design;

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ok: false, reason: "enter the logo's width and height" };
  }

  if (w > placement.maxWidthInches || h > placement.maxHeightInches) {
    return {
      ok: false,
      reason: `${placement.label} takes up to ${placement.maxWidthInches}" x ${placement.maxHeightInches}"`,
    };
  }

  const raw = w * h * complexity.coverage * STITCHES_PER_SQ_IN * STITCH_OVERHEAD;
  const stitches = Math.max(MIN_STITCHES, round100(raw));

  return {
    ok: true,
    stitches,
    low: Math.max(MIN_STITCHES, round100(stitches * 0.8)),
    high: round100(stitches * 1.25),
  };
}
