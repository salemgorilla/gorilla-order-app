/**
 * USPS GROUND ADVANTAGE — THE TWO TABLES THE SHOP HAS TO SUPPLY.
 *
 * Gabe, 2026-09-12: "I have a business account with usps" / "Ground
 * advantage works." Ground Advantage is priced by WEIGHT and ZONE, and the
 * zone is read from the origin (Salem, 01970 — prefix 019) and destination
 * ZIP. USPS publishes both tables, and neither is reachable from the
 * environment this code is written in, so they are data here, empty until
 * filled, and lib/shipping.ts falls back to the old dollar tiers while
 * either one is empty. A test pins that: filling these in flips it, on
 * purpose, so the change to live shipping is a deliberate commit.
 *
 * ── HOW TO FILL THEM IN ───────────────────────────────────────────────────
 *
 * ZONES_FROM_019: the USPS Domestic Zone Chart for origin 3-digit ZIP 019.
 *   postcalc.usps.com → "Domestic Zone Chart" → enter 019 → the page lists
 *   destination ZIP prefix ranges and a zone for each. Copy them as
 *   [fromPrefix, toPrefix, zone] triples. Prefixes are the first three
 *   digits of the destination ZIP, as numbers (e.g. "005" is 5). Zone is
 *   1–9. Local (zones 1–2) share a price column in the rate table.
 *
 * GROUND_ADVANTAGE_COMMERCIAL: from the USPS Business account, the
 *   "Commercial" price column for Ground Advantage, by weight and zone.
 *   One row per weight step, in ascending order of `maxLb`: ounce steps
 *   first (USPS groups 1–4 oz, 5–8 oz, 9–12 oz, 13–15.99 oz), then one row
 *   per pound to 70. `zones` is nine prices, zone 1 through zone 9, in
 *   dollars. Zones 1 and 2 are usually the same figure; enter it twice.
 *
 *   { maxLb: 0.25, zones: [4.xx, 4.xx, 4.xx, 4.xx, 4.xx, 5.xx, 5.xx, 5.xx, 6.xx] },
 *
 * Dimensional weight: Ground Advantage bills the greater of actual weight
 * and L x W x H / 166 for packages over one cubic foot. lib/shipping.ts
 * applies that from the package model; nothing to enter here.
 */

/** [fromPrefix, toPrefix, zone] — destination 3-digit ZIP prefix ranges. */
export const ZONES_FROM_019: ReadonlyArray<readonly [number, number, number]> = [];

/** Ascending by maxLb. `zones[0]` is zone 1, `zones[8]` is zone 9. */
export const GROUND_ADVANTAGE_COMMERCIAL: ReadonlyArray<{
  maxLb: number;
  zones: readonly number[];
}> = [];
