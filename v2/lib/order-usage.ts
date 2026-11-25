/**
 * WHAT CUSTOMERS PICK, WHAT THEY ACTUALLY ORDER, AND WHERE THEY STOP.
 *
 * Gabe, 2026-11-21, "Build both": the order page should adapt to how people
 * use it and how they end up ordering, and once a week Claude reviews where
 * people drop off and suggests changes for him to approve.
 *
 * Both need the same three counts, kept by the shop and nobody else:
 *
 *   picks   — which garment, colour, print location and size somebody chose
 *             on the page, whether or not they went on to submit.
 *   orders  — the same four things, read SERVER-SIDE from quotes that
 *             reached the shop. This is the stronger signal and the one the
 *             learned colour order leans on (lib/order-adapt-config.ts).
 *   funnel  — how many page visits reached each step, per product.
 *
 * ── FIRST-PARTY, AND NOTHING ABOUT THE PERSON ─────────────────────────────
 * lib/analytics.ts sends five events to Vercel Web Analytics and is careful
 * about it; this goes further, because it is the shop's own store and has no
 * reason to know anything about anyone. No cookie, no visitor id, no
 * session id, no IP, no user agent, no name, email, filename or note. A
 * page visit is deduplicated in memory and forgotten when the tab closes, so
 * two visits from one person are two visits and nothing can join them.
 *
 * Every value is checked against a closed list or a narrow pattern on the
 * SERVER, whatever the browser sent: garment styles must be ones the shop
 * sells, print locations must be real placements, steps and products are
 * fixed words. Colour and size names are the one free-ish field, and they
 * are held to short names: a colour is letters and spaces only (every one of
 * the 191 names S&S returns for the live styles fits), a size at most two
 * digits ("2XL") — no "@", no digit run, nothing an address or phone fits.
 *
 * The one key kept is the quote number on an ORDER, the same key
 * lib/submission-log.ts already logs: it points at the Printavo record that
 * legitimately holds the rest, so the weekly review can ask Printavo which
 * quotes were paid. It is never sent to the browser and never to anyone else.
 *
 * Pure: no I/O here, so all of it is testable against plain objects. The
 * blob store is lib/order-usage-store.ts.
 */

import { apparelCatalogStyles } from "./apparel-catalog";
import { getPrintPlacement } from "./print-placements";

/** The products, as lib/analytics.ts names them. */
export const USAGE_FLOWS = ["stickers", "signs", "banners", "apparel", "paper"] as const;
export type UsageFlow = (typeof USAGE_FLOWS)[number];

/**
 * The funnel, top to bottom, in the order the page asks (Product, Details,
 * Artwork, Contact, Review). Not every product has every step: stickers have
 * no garment and no sizes, so their funnel skips those two, and the report
 * reads drop-off between the steps a flow actually has. "garment_chosen"
 * means the visit started configuring a garment — picked one, a colour, a
 * location or a size — because many keep the garment the page opens on.
 */
export const FUNNEL_STEPS = [
  "product_chosen",
  "garment_chosen",
  "sizes_entered",
  "art_uploaded",
  "quote_viewed",
  "submitted",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export type PickField = "garment" | "color" | "placement" | "size";

export type UsagePick =
  | { field: "garment"; style: string }
  | { field: "color"; style: string; color: string }
  | { field: "placement"; value: string }
  | { field: "size"; value: string };

/** One product's share of a visit's post. */
export type UsageBeacon = {
  flow: UsageFlow;
  steps: FunnelStep[];
  picks: UsagePick[];
};

/** One garment line of a quote that reached the shop. */
export type OrderLine = {
  style: string;
  color: string;
  quantity: number;
  sizes: Record<string, number>;
};

export type OrderUsage = {
  quoteNumber: string;
  lines: OrderLine[];
  placements: string[];
};

export type Counts = Record<string, number>;

/** One shop day of everything, summed. */
export type DailyUsage = {
  version: 1;
  day: string;
  picks: Record<PickField, Counts>;
  orders: {
    count: number;
    /** Quotes that included this garment / colour / location. */
    garment: Counts;
    color: Counts;
    placement: Counts;
    /** Pieces, not quotes: how many of each size and colour were asked for. */
    size: Counts;
    colorPieces: Counts;
    quoteNumbers: string[];
  };
  funnel: Partial<Record<UsageFlow, Partial<Record<FunnelStep, number>>>>;
};

export const MAX_PICKS_PER_BEACON = 60;
export const MAX_BEACONS_PER_POST = USAGE_FLOWS.length;
export const MAX_BEACON_BYTES = 8_000;
const MAX_QUOTE_NUMBERS_PER_DAY = 1_000;

/**
 * Colour and size names: letters, spaces and the few joiners S&S uses
 * ("Pink/White", "Heather True Royal", "2XL"). Short, and digits limited to
 * a couple, so nothing shaped like a phone number, email or address fits.
 */
const COLOR_NAME = /^[A-Za-z][A-Za-z '&/+.-]{0,39}$/;
const SIZE_NAME = /^[A-Za-z0-9][A-Za-z0-9 /-]{0,11}$/;
const QUOTE_NUMBER = /^[A-Z]{2}-\d{8}-[A-Z0-9]{4,12}$/;

/** "  heather   navy " → "Heather Navy" casing kept, spaces tidied. */
function tidy(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function knownStyle(style: string, styles: readonly string[]): boolean {
  return styles.includes(style);
}

function cleanColor(value: unknown): string | null {
  const color = tidy(value);
  return color && COLOR_NAME.test(color) ? color : null;
}

function cleanSize(value: unknown): string | null {
  const size = tidy(value).toUpperCase();
  if (!size || !SIZE_NAME.test(size)) return null;
  if ((size.match(/\d/g) || []).length > 2) return null;
  return size;
}

function cleanPlacement(value: unknown): string | null {
  const id = tidy(value);
  return id && getPrintPlacement(id) ? id : null;
}

/** The key a colour is counted under: colours are named per style. */
export function colorKey(style: string, color: string): string {
  return `${style}|${color}`;
}

export function splitColorKey(key: string): { style: string; color: string } {
  const at = key.indexOf("|");
  return at < 0
    ? { style: "", color: key }
    : { style: key.slice(0, at), color: key.slice(at + 1) };
}

/**
 * The browser's post to a beacon the store may keep, or null.
 *
 * Anything unrecognised is DROPPED one value at a time, not refused whole:
 * a page that is one deploy behind may send a step this one does not know,
 * and the rest of that visit is still worth counting. Duplicates are folded,
 * so a page cannot count one click twice by sending it twice.
 */
export function parseUsageBeacon(
  input: unknown,
  styles: readonly string[] = apparelCatalogStyles
): UsageBeacon | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const flow = USAGE_FLOWS.find((name) => name === raw.flow);
  if (!flow) return null;

  const steps = Array.isArray(raw.steps)
    ? FUNNEL_STEPS.filter((step) => (raw.steps as unknown[]).includes(step))
    : [];

  const picks: UsagePick[] = [];
  const seen = new Set<string>();
  const rawPicks = Array.isArray(raw.picks)
    ? raw.picks.slice(0, MAX_PICKS_PER_BEACON)
    : [];

  for (const item of rawPicks) {
    if (!item || typeof item !== "object") continue;
    const pick = item as Record<string, unknown>;
    let clean: UsagePick | null = null;

    if (pick.field === "garment") {
      const style = tidy(pick.style);
      if (knownStyle(style, styles)) clean = { field: "garment", style };
    } else if (pick.field === "color") {
      const style = tidy(pick.style);
      const color = cleanColor(pick.color);
      if (knownStyle(style, styles) && color) clean = { field: "color", style, color };
    } else if (pick.field === "placement") {
      const value = cleanPlacement(pick.value);
      if (value) clean = { field: "placement", value };
    } else if (pick.field === "size") {
      const value = cleanSize(pick.value);
      if (value) clean = { field: "size", value };
    }

    if (!clean) continue;
    const key = JSON.stringify(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(clean);
  }

  if (steps.length === 0 && picks.length === 0) return null;

  return { flow, steps, picks };
}

/**
 * The whole post: `{ beacons: [...] }`, one per product the visit touched.
 * At most one beacon per product survives — a second for the same product
 * is a page counting itself twice.
 */
export function parseUsagePost(
  input: unknown,
  styles: readonly string[] = apparelCatalogStyles
): UsageBeacon[] {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const list = Array.isArray(raw.beacons) ? raw.beacons.slice(0, MAX_BEACONS_PER_POST) : [];
  const byFlow = new Map<UsageFlow, UsageBeacon>();
  for (const entry of list) {
    const beacon = parseUsageBeacon(entry, styles);
    if (beacon && !byFlow.has(beacon.flow)) byFlow.set(beacon.flow, beacon);
  }
  return [...byFlow.values()];
}

/** "M-12, L-6, 2XL-3" → { M: 12, L: 6, 2XL: 3 }. Junk entries are skipped. */
export function parseSizeBreakdown(text: unknown): Record<string, number> {
  const sizes: Record<string, number> = {};

  for (const part of String(text ?? "").split(",")) {
    const match = part.trim().match(/^(.+?)\s*[-:x×]\s*(\d{1,5})$/i);
    if (!match) continue;
    const size = cleanSize(match[1]);
    const quantity = Number(match[2]);
    if (!size || !(quantity > 0)) continue;
    sizes[size] = (sizes[size] || 0) + quantity;
  }

  return sizes;
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

/**
 * The garment lines of a submitted APPAREL quote, read from the same payload
 * the shop email and Printavo read. Null for every other product, for a
 * request-mode quote that never chose a garment, and for anything that does
 * not name a style the shop sells.
 *
 * A cart carries its lines in `pricing.lines` (each with its own colour,
 * quantity and sizes); a one-garment quote carries them in
 * `product.supplier` and `product.sizeBreakdown`. "Not selected" is how the
 * page says nothing was chosen, and is counted as nothing.
 */
export function orderUsageFromPayload(
  payload: unknown,
  quoteNumber: string,
  styles: readonly string[] = apparelCatalogStyles
): OrderUsage | null {
  const order = asRecord(payload);
  const product = asRecord(order.product);
  const pricing = asRecord(order.pricing);
  const supplier = asRecord(product.supplier);

  // Apparel only. The supplier block is what makes a payload apparel
  // (lib/order-flow.ts reads the same marker).
  if (!order.product || !product.supplier) return null;

  const lines: OrderLine[] = [];
  const cartLines = Array.isArray(pricing.lines) ? pricing.lines : [];

  if (cartLines.length > 0) {
    for (const entry of cartLines) {
      const line = asRecord(entry);
      const style = tidy(line.catalogStyle);
      const color = cleanColor(line.colorName);
      if (!knownStyle(style, styles) || !color) continue;
      lines.push({
        style,
        color,
        quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
        sizes: parseSizeBreakdown(line.sizeBreakdown),
      });
    }
  }

  if (lines.length === 0) {
    const style = tidy(supplier.catalogStyle);
    const color = cleanColor(product.garmentColor || supplier.colorName);
    if (knownStyle(style, styles) && color && color !== "Not selected") {
      lines.push({
        style,
        color,
        quantity: Math.max(0, Math.floor(Number(product.quantity) || 0)),
        sizes: parseSizeBreakdown(product.sizeBreakdown),
      });
    }
  }

  if (lines.length === 0) return null;

  const placements = Array.isArray(product.printLocations)
    ? [...new Set(product.printLocations.map(cleanPlacement).filter(Boolean) as string[])]
    : [];

  return {
    quoteNumber: QUOTE_NUMBER.test(quoteNumber) ? quoteNumber : "",
    lines,
    placements,
  };
}

export function emptyDailyUsage(day: string): DailyUsage {
  return {
    version: 1,
    day,
    picks: { garment: {}, color: {}, placement: {}, size: {} },
    orders: {
      count: 0,
      garment: {},
      color: {},
      placement: {},
      size: {},
      colorPieces: {},
      quoteNumbers: [],
    },
    funnel: {},
  };
}

function bump(counts: Counts, key: string, by = 1) {
  if (!key || !(by > 0)) return;
  counts[key] = (counts[key] || 0) + by;
}

/** Adds one visit's beacon to a day. Mutates and returns `day`. */
export function addBeacon(day: DailyUsage, beacon: UsageBeacon): DailyUsage {
  const flow = (day.funnel[beacon.flow] ||= {});
  for (const step of beacon.steps) flow[step] = (flow[step] || 0) + 1;

  for (const pick of beacon.picks) {
    if (pick.field === "garment") bump(day.picks.garment, pick.style);
    else if (pick.field === "color") bump(day.picks.color, colorKey(pick.style, pick.color));
    else bump(day.picks[pick.field], pick.value);
  }

  return day;
}

/** Adds one quote that reached the shop. Mutates and returns `day`. */
export function addOrder(day: DailyUsage, order: OrderUsage): DailyUsage {
  day.orders.count += 1;

  const garments = new Set<string>();
  const colors = new Set<string>();

  for (const line of order.lines) {
    garments.add(line.style);
    const key = colorKey(line.style, line.color);
    colors.add(key);
    bump(day.orders.colorPieces, key, line.quantity);
    for (const [size, quantity] of Object.entries(line.sizes)) {
      bump(day.orders.size, size, quantity);
    }
  }

  for (const style of garments) bump(day.orders.garment, style);
  for (const key of colors) bump(day.orders.color, key);
  for (const placement of order.placements) bump(day.orders.placement, placement);

  if (
    order.quoteNumber &&
    day.orders.quoteNumbers.length < MAX_QUOTE_NUMBERS_PER_DAY &&
    !day.orders.quoteNumbers.includes(order.quoteNumber)
  ) {
    day.orders.quoteNumbers.push(order.quoteNumber);
  }

  return day;
}

function mergeCounts(into: Counts, from: Counts | undefined) {
  for (const [key, value] of Object.entries(from || {})) {
    if (Number(value) > 0) bump(into, key, Number(value));
  }
}

/** Sum of several days (or of a stored day and fresh raw records). */
export function mergeDailyUsage(day: string, parts: DailyUsage[]): DailyUsage {
  const total = emptyDailyUsage(day);

  for (const part of parts) {
    for (const field of ["garment", "color", "placement", "size"] as const) {
      mergeCounts(total.picks[field], part.picks?.[field]);
    }
    total.orders.count += Number(part.orders?.count) || 0;
    for (const field of ["garment", "color", "placement", "size", "colorPieces"] as const) {
      mergeCounts(total.orders[field], part.orders?.[field]);
    }
    for (const quote of part.orders?.quoteNumbers || []) {
      if (
        total.orders.quoteNumbers.length < MAX_QUOTE_NUMBERS_PER_DAY &&
        !total.orders.quoteNumbers.includes(quote)
      ) {
        total.orders.quoteNumbers.push(quote);
      }
    }
    for (const [flow, steps] of Object.entries(part.funnel || {})) {
      const into = (total.funnel[flow as UsageFlow] ||= {});
      for (const [step, value] of Object.entries(steps || {})) {
        const n = Number(value) || 0;
        if (n > 0) into[step as FunnelStep] = (into[step as FunnelStep] || 0) + n;
      }
    }
  }

  return total;
}

/**
 * The shop's calendar day for an instant. America/New_York, because "last
 * Tuesday" in the weekly review means Tuesday in Salem, not in UTC.
 */
export function shopDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** "2026-11-21" plus n days (negative goes back). Calendar arithmetic, in UTC. */
export function addDays(day: string, n: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000
  );
}
