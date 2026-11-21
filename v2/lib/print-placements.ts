/**
 * The print placements a customer can pick, and how big each one prints.
 *
 * ── WHERE THESE COME FROM ─────────────────────────────────────────────────
 * Gabe, 2026-11-21, sharing a placement chart: "Use this for tee printing"
 * and "adapt similar solutions for other garments". The names and size
 * ranges are that chart's (left chest 2.5-5" wide, full front 10-12", full
 * back 10-14" …). Where each one SITS on the garment follows the Stahls'
 * design-placement guide he sent with it: front 3-3.5" below the collar,
 * left chest 4-6" off centre, hoodie back clear of the hood.
 *
 * ── "Front" AND "Back" KEEP THEIR NAMES ───────────────────────────────────
 * They are the chart's full front and full back. Every saved quote, reorder
 * link, Printavo description and committed price total says "Front" and
 * "Back", so the new placements are added beside them rather than renaming
 * them.
 *
 * ── ONE PER AREA ──────────────────────────────────────────────────────────
 * Placements in the same `area` overlap on the garment (a left chest sits
 * inside a full front), so picking one replaces the other. Collar back and
 * sleeve overlap nothing and combine with anything.
 *
 * Pricing does not read this file: every placement is one more print
 * location, priced by its ink colours like "Front" and "Back" always were.
 */

export type PlacementSide = "front" | "back";

export type GarmentFamily = "tee" | "longSleeve" | "crewneck" | "hoodie";

export type PrintPlacement = {
  /** Stored on the quote, shown to the shop. Never rename one. */
  id: string;
  side: PlacementSide;
  /** Placements sharing an area replace each other. */
  area: "front" | "back" | null;
  /** The chart's size, per garment family. Absent = not offered on it. */
  sizes: Partial<Record<GarmentFamily, string>>;
};

const TEE_AND_CREW = (size: string) => ({
  tee: size,
  longSleeve: size,
  crewneck: size,
});

export const printPlacements: PrintPlacement[] = [
  {
    id: "Left Chest",
    side: "front",
    area: "front",
    sizes: { ...TEE_AND_CREW('2.5–5" wide'), hoodie: '2.5–5" wide' },
  },
  {
    id: "Center Chest",
    side: "front",
    area: "front",
    sizes: { ...TEE_AND_CREW('6–10" wide, 6–8" tall'), hoodie: '6–10" wide, 6–8" tall' },
  },
  {
    id: "Front",
    side: "front",
    area: "front",
    // Hoodie: the pouch pocket caps the height.
    sizes: { ...TEE_AND_CREW('Full front, 10–12" wide'), hoodie: 'Full front, 10–12" wide, above the pocket' },
  },
  {
    id: "Oversize Front",
    side: "front",
    area: "front",
    // Not on a pullover hoodie: at this size the print runs over the pocket.
    sizes: TEE_AND_CREW('12–15" wide, 14–16" tall'),
  },
  {
    id: "Collar Back",
    side: "back",
    area: null,
    // Not on a hoodie: the hood covers it.
    sizes: TEE_AND_CREW('1–3", just below the collar'),
  },
  {
    id: "Upper Back",
    side: "back",
    area: "back",
    sizes: { ...TEE_AND_CREW('10–14" wide, 1–6" tall'), hoodie: '10–14" wide, below the hood' },
  },
  {
    id: "Back",
    side: "back",
    area: "back",
    sizes: { ...TEE_AND_CREW('Full back, 10–14" wide'), hoodie: 'Full back, 10–14" wide, below the hood' },
  },
  {
    id: "Sleeve",
    side: "front",
    area: null,
    sizes: {
      tee: '1–4"',
      // Long sleeves print down the arm (Stahls: 2" x 11.5").
      longSleeve: 'Down the sleeve, up to 2" x 11.5"',
      crewneck: 'Down the sleeve, up to 2" x 11.5"',
      hoodie: 'Down the sleeve, up to 2" x 11.5"',
    },
  },
];

const byId = new Map(printPlacements.map((placement) => [placement.id, placement]));

export function getPrintPlacement(id: string): PrintPlacement | undefined {
  return byId.get(id);
}

/**
 * Which family a garment prints like. Keyed off the S&S style when there is
 * one (lib/apparel-catalog.ts), else the garment's name — a hoodie that
 * reached us by name still loses the placements its hood and pocket cover.
 */
const STYLE_FAMILY: Record<string, GarmentFamily> = {
  "39": "tee",
  "7584": "tee",
  "10628": "tee",
  "135": "longSleeve",
  "372": "crewneck",
  "395": "hoodie",
};

export function garmentFamily(input: {
  catalogStyle?: string | null;
  garmentType?: string | null;
}): GarmentFamily {
  const fromStyle = input.catalogStyle ? STYLE_FAMILY[input.catalogStyle] : undefined;
  if (fromStyle) return fromStyle;

  const name = (input.garmentType || "").toLowerCase();
  if (/hood/.test(name)) return "hoodie";
  if (/crew|sweat/.test(name)) return "crewneck";
  if (/long/.test(name)) return "longSleeve";
  return "tee";
}

/** The placements offered on a garment family, in chart order. */
export function placementsFor(family: GarmentFamily): PrintPlacement[] {
  return printPlacements.filter((placement) => placement.sizes[family]);
}

/**
 * The location list after the customer taps one placement: toggled off if it
 * was on; otherwise added, replacing whatever already holds its area.
 */
export function togglePlacement(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((item) => item !== id);

  const area = getPrintPlacement(id)?.area;
  const kept = area
    ? current.filter((item) => getPrintPlacement(item)?.area !== area)
    : current;

  return [...kept, id];
}

/**
 * Drop the placements a garment does not offer — switching a tee with an
 * oversize front to a hoodie must not carry a print the hoodie cannot take.
 * Unknown strings (an old payload's free text) are kept: they are the
 * shop's to read, not ours to delete.
 */
export function keepOfferedPlacements(
  current: string[],
  family: GarmentFamily
): string[] {
  const kept = current.filter((id) => {
    const placement = getPrintPlacement(id);
    return !placement || Boolean(placement.sizes[family]);
  });

  // An oversize front on a tee becomes a full front on a hoodie, not
  // nothing: the customer still wants the front printed.
  const lostFront = current.some(
    (id) => getPrintPlacement(id)?.area === "front" && !kept.includes(id)
  );
  const hasFront = kept.some((id) => getPrintPlacement(id)?.area === "front");

  return lostFront && !hasFront ? ["Front", ...kept] : kept;
}
