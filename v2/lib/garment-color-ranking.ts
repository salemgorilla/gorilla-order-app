import { PINNED_COLOR_SLOTS } from "./order-adapt-config";

/**
 * Which garment colours show first, most-ordered at the top.
 *
 * Gabe, 2026-11-21: "list the colors in order that they're commonly ordered.
 * Black, navy, sport grey, these colors are more frequently ordered. I would
 * like to put those colors first, as they are most likely to be picked."
 *
 * ── HOW TO EDIT ───────────────────────────────────────────────────────────
 * One line per slot, most popular first. Move a line up or down to change
 * the order, delete a line to stop promoting that colour, add a line to
 * promote a new one.
 *
 * Each slot lists the names that colour goes by across styles, because S&S
 * names the same colour differently per garment: the grey Gildan calls
 * "Sport Grey" is "Athletic Heather" on the Bella+Canvas 3001CVC, and that
 * tee has no plain "Black", only "Solid Black Blend". For each garment the
 * FIRST name in the slot that the garment actually has takes the slot; the
 * rest of that slot's names are left where they would have been anyway.
 * Matching ignores case.
 *
 * Every colour not named here keeps its old place: alphabetical, after the
 * ranked ones. So nothing disappears and a new S&S colour still shows up.
 *
 * ── THIS IS THE STARTING ORDER, NOT THE FINAL ONE ─────────────────────────
 * Once a garment has enough real picks and quotes behind it, the catalogue
 * route re-sorts it from that data (lib/adaptive-color-order.ts), with this
 * list as the prior it starts from and the pins always on top. Until then,
 * and whenever the data cannot be read, this order is exactly what shows.
 *
 * ── WHERE THE ORDER CAME FROM ─────────────────────────────────────────────
 * The first three are Gabe's own words. The rest are ranked by pieces the
 * shop bought from S&S: 65 order confirmations in the shop's mail, Nov 2025
 * to Nov 2026, about 9,800 tees, hoodies and sweatshirts. Black was about
 * three in four of every piece; then Navy, the reds, Maroon, dark greens,
 * charcoals and light blues. Below that the shop's orders get thin, so the
 * usual print-shop staples fill in.
 */
export const GARMENT_COLOR_RANKING: readonly (readonly string[])[] = [
  // Gabe's three, in his order. They live in lib/order-adapt-config.ts
  // because they are also the colours the learned order may never move.
  ...PINNED_COLOR_SLOTS,
  // Then the shop's own S&S orders, Nov 2025 to Nov 2026, with White kept
  // high as the staple every shop sells.
  ["White", "Solid White Blend"],
  ["Charcoal", "Dark Heather", "Dark Grey Heather", "Heather Charcoal"],
  ["Red", "Heather Red", "Solid Red Blend", "Heather Canvas Red"],
  ["Maroon", "Heather Maroon"],
  ["Forest", "Forest Green", "Heather Forest"],
  ["Royal", "Heather True Royal", "Solid True Royal Blend"],
  ["Carolina Blue", "Heather Columbia Blue", "Heather Carolina Blue"],
  ["Light Blue", "Sky", "Heather Baby Blue", "Heather Ice Blue"],
  ["Ash", "Ice Grey", "Heather Cement"],
  ["Military Green", "Heather Military Green", "Heather Olive"],
  ["Safety Orange", "Neon Orange"],
  ["Cardinal Red", "Heather Cardinal"],
  ["Light Pink", "Heather Pink"],
  ["Sand", "Heather Sand Dune", "Heather Tan"],
  ["Purple", "Heather Team Purple"],
  ["Gold", "Heather Yellow Gold"],
  ["Orange", "Heather Orange"],
  ["Irish Green", "Heather Kelly", "Kelly"],
  ["Natural", "Heather Natural"],
  ["Safety Green", "Neon Yellow"],
];

/** How many colours the order page shows before "Show all colours". */
export const POPULAR_COLOR_COUNT = 12;

type Named = { colorName: string };

/**
 * The colours in shop order: ranked slots first, then everything else in the
 * order it came in (the catalogue sorts that alphabetically). Never drops or
 * duplicates a colour, and does not mutate its input.
 */
export function sortColorsByPopularity<T extends Named>(
  colors: readonly T[],
  ranking: readonly (readonly string[])[] = GARMENT_COLOR_RANKING
): T[] {
  const byName = new Map<string, T>();
  for (const color of colors) {
    const key = color.colorName.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, color);
  }

  const ranked: T[] = [];
  const taken = new Set<T>();

  for (const slot of ranking) {
    for (const name of slot) {
      const match = byName.get(name.trim().toLowerCase());
      if (match && !taken.has(match)) {
        ranked.push(match);
        taken.add(match);
        break;
      }
    }
  }

  return [...ranked, ...colors.filter((color) => !taken.has(color))];
}
