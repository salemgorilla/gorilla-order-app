/**
 * SHIPPING FOR STICKERS — BY WEIGHT AND ZONE WHEN IT CAN BE, BY TIER UNTIL THEN.
 *
 * ── WHERE THIS CAME FROM ─────────────────────────────────────────────────
 * Gabe, 2026-09-12: "We need to figure out how much each order weighs and
 * get cost by weight and dimensions of commonly used packages or packing
 * bags." Then: "I have a business account with usps" and "Ground advantage
 * works."
 *
 * Shipping was a flat $12 at any size, then (#155) the old site's dollar
 * tiers. Both priced the ORDER TOTAL, which only stands in for weight. USPS
 * Ground Advantage prices weight x zone, so this estimates the parcel and
 * looks the rate up — and while the two USPS tables in lib/usps-data.ts are
 * empty, or the order carries no ZIP, it falls back to the tiers exactly
 * as they were. Nothing about live shipping changes until the tables do.
 *
 * ── THE WEIGHT MODEL, AND WHAT IS ASSUMED ─────────────────────────────────
 * A sticker order is vinyl on a release liner, cut, in a mailer or a box.
 *
 *   VINYL_LB_PER_SQFT   0.10  — 3-mil calendared vinyl plus its liner. A
 *                               spec-sheet figure, NOT yet checked on the
 *                               shop's scale. One weighed order settles it;
 *                               the constant is here to be corrected.
 *   WASTE               1.25  — liner border, gaps between cuts, trim.
 *   PACKAGES            three containers by the area they hold, each with
 *                               its own empty weight and dimensions.
 *
 * Every figure is a named constant with its reason beside it, because the
 * day the scale disagrees, the fix should be one number.
 */

import { GROUND_ADVANTAGE_COMMERCIAL, ZONES_FROM_019 } from "./usps-data";

const VINYL_LB_PER_SQFT = 0.1;
const WASTE = 1.25;

/**
 * Containers, smallest first. `holdsSqFt` is the most vinyl that goes in;
 * the first one that fits is the one used. Beyond the last, the order ships
 * as more than one box and is rated as the last container per box.
 */
export const PACKAGES: ReadonlyArray<{
  name: string;
  holdsSqFt: number;
  emptyLb: number;
  /** Inches. Used only for the dimensional-weight check. */
  dims: readonly [number, number, number];
}> = [
  { name: "rigid mailer", holdsSqFt: 3.5, emptyLb: 0.15, dims: [12.5, 9.5, 0.5] },
  { name: "small box", holdsSqFt: 40, emptyLb: 0.45, dims: [10, 8, 4] },
  { name: "medium box", holdsSqFt: 150, emptyLb: 0.75, dims: [14, 12, 6] },
];

/** USPS: DIM weight applies over one cubic foot, at L x W x H / 166. */
const DIM_DIVISOR = 166;
const DIM_THRESHOLD_CU_IN = 1728;

export type ParcelEstimate = {
  vinylSqFt: number;
  vinylLb: number;
  package: (typeof PACKAGES)[number];
  /** How many of that package. 1 for everything the shop usually sells. */
  boxes: number;
  /** Per box: the greater of actual and dimensional weight. */
  billableLbPerBox: number;
};

/**
 * What the parcel weighs, from what is in it.
 *
 * Per design because that is what the cart is; a 2x2 and a 5x6 in one
 * order are two areas, not one average.
 */
export function estimateParcel(
  items: ReadonlyArray<{ quantity: number; widthInches: number; heightInches: number }>
): ParcelEstimate {
  const vinylSqFt =
    items.reduce((sum, item) => {
      const q = Math.max(0, Number(item.quantity) || 0);
      const area = Math.max(0, Number(item.widthInches) || 0) * Math.max(0, Number(item.heightInches) || 0);
      return sum + (q * area) / 144;
    }, 0) * WASTE;

  const vinylLb = vinylSqFt * VINYL_LB_PER_SQFT;
  const pkg = PACKAGES.find((p) => vinylSqFt <= p.holdsSqFt) ?? PACKAGES[PACKAGES.length - 1];
  const boxes = Math.max(1, Math.ceil(vinylSqFt / pkg.holdsSqFt));

  const actualPerBox = vinylLb / boxes + pkg.emptyLb;
  const cubicIn = pkg.dims[0] * pkg.dims[1] * pkg.dims[2];
  const dimLb = cubicIn > DIM_THRESHOLD_CU_IN ? cubicIn / DIM_DIVISOR : 0;

  return {
    vinylSqFt: Math.round(vinylSqFt * 100) / 100,
    vinylLb: Math.round(vinylLb * 100) / 100,
    package: pkg,
    boxes,
    billableLbPerBox: Math.round(Math.max(actualPerBox, dimLb) * 100) / 100,
  };
}

/** The old site's dollar tiers — the fallback, and the price until the tables are filled. */
export const SHIPPING_TIERS: ReadonlyArray<{ upTo: number | null; price: number }> = [
  { upTo: 75, price: 8 },
  { upTo: 200, price: 12 },
  { upTo: 500, price: 18 },
  { upTo: null, price: 25 },
];

/** The old flat rate, which is the $75–$200 tier. Tests read it. */
export const DECAL_SHIPPING_PRICE = 12;

export function tieredShippingPrice(goodsSubtotal: number): number {
  const subtotal = Math.max(0, Number(goodsSubtotal) || 0);
  const tier = SHIPPING_TIERS.find((t) => t.upTo === null || subtotal <= t.upTo);
  return tier ? tier.price : SHIPPING_TIERS[SHIPPING_TIERS.length - 1].price;
}

export type ShippingTables = {
  zones: ReadonlyArray<readonly [number, number, number]>;
  rates: ReadonlyArray<{ maxLb: number; zones: readonly number[] }>;
};

const LIVE_TABLES: ShippingTables = {
  zones: ZONES_FROM_019,
  rates: GROUND_ADVANTAGE_COMMERCIAL,
};

/** Zone for a destination ZIP, or null when unknown. First three digits. */
export function zoneForZip(destZip: string, tables: ShippingTables = LIVE_TABLES): number | null {
  const prefix = Number(String(destZip || "").trim().slice(0, 3));
  if (!Number.isInteger(prefix) || String(destZip || "").trim().length < 5) return null;

  const row = tables.zones.find(([from, to]) => prefix >= from && prefix <= to);
  return row ? row[2] : null;
}

/** The commercial rate for one box, or null when the table cannot answer. */
export function groundAdvantageRate(
  billableLb: number,
  zone: number,
  tables: ShippingTables = LIVE_TABLES
): number | null {
  if (!(billableLb > 0) || zone < 1 || zone > 9) return null;

  const row = tables.rates.find((r) => billableLb <= r.maxLb);
  if (!row) return null; // over the heaviest step — over 70 lb per box

  const price = row.zones[zone - 1];
  return Number.isFinite(price) && price > 0 ? price : null;
}

export type ShippingQuote = {
  price: number;
  /** "tier" until the USPS tables are filled; then "ground-advantage". */
  method: "none" | "tier" | "ground-advantage";
  zone?: number;
  parcel?: ParcelEstimate;
  /** One line for the shop email and the Printavo note. */
  note: string;
};

/**
 * The one entry point. Falls back, never throws, never charges zero for a
 * shipped order.
 */
export function quoteStickerShipping(input: {
  deliveryMethod: string;
  goodsSubtotal: number;
  items?: ReadonlyArray<{ quantity: number; widthInches: number; heightInches: number }>;
  destZip?: string;
  tables?: ShippingTables;
}): ShippingQuote {
  if (input.deliveryMethod !== "Ship") {
    return { price: 0, method: "none", note: "Local pickup in Salem" };
  }

  const tables = input.tables ?? LIVE_TABLES;
  const parcel = input.items?.length ? estimateParcel(input.items) : undefined;
  const zone = input.destZip ? zoneForZip(input.destZip, tables) : null;
  const perBox = parcel && zone ? groundAdvantageRate(parcel.billableLbPerBox, zone, tables) : null;

  if (parcel && zone && perBox !== null) {
    const price = Math.round(perBox * parcel.boxes * 100) / 100;
    return {
      price,
      method: "ground-advantage",
      zone,
      parcel,
      note:
        `USPS Ground Advantage to ${String(input.destZip).trim().slice(0, 5)} (zone ${zone}), ` +
        `${parcel.boxes > 1 ? `${parcel.boxes} x ` : ""}${parcel.package.name} at ~${parcel.billableLbPerBox} lb`,
    };
  }

  // The tables are empty, the ZIP is missing or unzoned, or the box is
  // over 70 lb. The tiers are what shipped before, and they still do.
  const price = tieredShippingPrice(input.goodsSubtotal);
  return {
    price,
    method: "tier",
    parcel,
    note: `Shipping (tiered on order size)${parcel ? ` — est. ${parcel.billableLbPerBox} lb, ${parcel.package.name}` : ""}`,
  };
}
