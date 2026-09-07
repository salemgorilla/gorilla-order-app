import { SKU, SKU_FAMILY } from "./sku";

/**
 * WHAT IS ACTUALLY ON THE PRESS — the hero's one live datum.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Gabe, 2026-09-07, choosing between a randomised headline and a real one:
 * "Make it real rather than random." A rotating slogan is decoration; a true
 * count of what the shop printed this week is the kind of datum the whole
 * design register is built on, and it says something no slogan can — that
 * this is a working shop, and that it prints the thing you came for.
 *
 * ── HONESTY RULES, WHICH ARE THE WHOLE POINT ──────────────────────────────
 * A number on the hero is a claim. Three rules keep it one the shop can
 * stand behind, and all three are enforced here rather than in the UI:
 *
 *   1. COUNT WHAT WAS SOLD, NOT WHAT WAS QUOTED. Only invoiced work counts.
 *      A quote is a conversation; counting it would inflate the figure with
 *      jobs that never happened.
 *   2. A QUIET WEEK SAYS NOTHING. Below MIN_PIECES the line is withheld
 *      entirely rather than announcing "3 stickers this week". The shop is
 *      not obliged to publish a slow fortnight, and a tiny number reads as
 *      a dead business rather than an honest one.
 *   3. NO CUSTOMER IS NAMED. Quantities by product family, nothing else —
 *      never a company, a job name, or an amount. This is a public page.
 *
 * ── AND IT IS ALWAYS OPTIONAL ─────────────────────────────────────────────
 * Every function here returns null rather than throwing or guessing. If
 * Printavo is unreachable, unconfigured, or answers in a shape we do not
 * recognise, the hero renders exactly as it does today. A live number is a
 * bonus on a page whose job is quoting; it may never be a dependency.
 */

/** Below this the line is withheld — see rule 2. */
export const MIN_PIECES = 50;

/** How far back "this week" reaches. */
export const WINDOW_DAYS = 7;

export type PressCount = {
  /** "stickers" | "signs" | "garments" — what the customer calls it. */
  noun: string;
  quantity: number;
};

export type PressActivity = {
  counts: PressCount[];
  /** Every piece across the counts, so the caller need not re-add them. */
  total: number;
  windowDays: number;
};

/**
 * One line item, as much of it as this file needs. Deliberately loose: it is
 * whatever Printavo hands back, and a field we did not expect must not throw.
 */
export type PressLineItem = {
  itemNumber?: unknown;
  quantity?: unknown;
};

export type PressOrder = {
  /** ISO timestamp. Anything unparseable is treated as outside the window. */
  createdAt?: unknown;
  lineItems?: unknown;
};

/**
 * Every SKU that is a CHARGE rather than a printed thing.
 *
 * Built from the constants in lib/sku.ts, so a rename there follows here
 * instead of silently turning a fee into a product. The first cut of this
 * matched fees by substring and missed GORILLA-APPAREL-PRINT, which counted
 * the print fee as 48 more garments and doubled the number on the hero —
 * caught by tests/press-activity, and the reason the list is now explicit.
 */
const FEE_SKUS = new Set<string>([
  SKU.DECAL_SETUP,
  SKU.APPAREL_PRINT,
  SKU.APPAREL_SETUP,
  SKU.RUSH,
  SKU.SHIPPING,
]);

/**
 * Signs fees are `GORILLA-SIGN-<charge code>`, and their product SKUs are
 * `GORILLA-SIGN-<product label>`, so the two cannot be told apart by shape.
 * These are the charge codes lib/signs-pricing.ts actually emits.
 * tests/press-activity drives the REAL Printavo plans and fails if a new
 * fee kind appears that is not covered here.
 */
const SIGNS_FEE_CODES = ["SETUP", "MINIMUM", "ADDON-"];

/**
 * The customer-facing noun for a SKU, or null for anything that is not goods.
 *
 * Keyed off the SKU grammar in lib/sku.ts — the same codes the invoice files
 * under — so this cannot drift from what the shop bills. Fees, shipping and
 * rush are NOT products: counting a setup charge as a "piece" would inflate
 * the hero with things nobody printed.
 */
export function nounForSku(itemNumber: string): string | null {
  const sku = itemNumber.trim().toUpperCase();

  if (!sku || FEE_SKUS.has(sku)) return null;

  if (sku.startsWith(`${SKU_FAMILY.signs}-`)) {
    const code = sku.slice(SKU_FAMILY.signs.length + 1);
    const isFee = SIGNS_FEE_CODES.some(
      (fee) => code === fee || code.startsWith(fee)
    );

    return isFee ? null : "signs";
  }

  // Stickers are positively shaped: the bare family code, or it plus a cart
  // position. That excludes GORILLA-DECAL-SETUP by construction rather than
  // by listing it, which is the safer direction for a family whose fee names
  // could grow.
  if (
    sku === SKU_FAMILY.stickers ||
    new RegExp(`^${SKU_FAMILY.stickers}-\\d+$`).test(sku)
  ) {
    return "stickers";
  }

  if (sku.startsWith(`${SKU_FAMILY.apparel}-`)) return "garments";

  // A code from before this grammar, or one added since. Not counted — a
  // number the shop cannot explain is worse than a smaller one it can.
  return null;
}

function isWithinWindow(createdAt: unknown, now: Date, windowDays: number) {
  if (typeof createdAt !== "string") return false;

  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;

  const ageMs = now.getTime() - at;

  // Future-dated orders are a clock problem, not this week's work.
  return ageMs >= 0 && ageMs <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * Roll a page of invoiced orders up into what the hero can say.
 *
 * Returns null when there is nothing worth saying — no orders in the window,
 * nothing recognisable in them, or a total under MIN_PIECES. The caller
 * renders nothing at all in that case; there is no "quiet week" copy.
 */
export function summarisePressActivity(
  orders: PressOrder[],
  options: { now?: Date; windowDays?: number; minPieces?: number } = {}
): PressActivity | null {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? WINDOW_DAYS;
  const minPieces = options.minPieces ?? MIN_PIECES;

  const totals = new Map<string, number>();

  for (const order of orders) {
    if (!isWithinWindow(order?.createdAt, now, windowDays)) continue;

    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];

    for (const raw of lineItems as PressLineItem[]) {
      const noun = nounForSku(String(raw?.itemNumber ?? ""));
      if (!noun) continue;

      const quantity = Number(raw?.quantity);
      // Floor at zero rather than trusting a negative: a credit note should
      // not quietly subtract from "what we printed this week".
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      totals.set(noun, (totals.get(noun) ?? 0) + Math.floor(quantity));
    }
  }

  const counts = [...totals.entries()]
    .map(([noun, quantity]) => ({ noun, quantity }))
    // Biggest first: the shop's busiest line leads, which is also the one a
    // visitor is most likely to be here for.
    .sort((a, b) => b.quantity - a.quantity);

  const total = counts.reduce((sum, entry) => sum + entry.quantity, 0);

  if (!counts.length || total < minPieces) return null;

  return { counts, total, windowDays };
}

/**
 * The sentence, built from the counts. Kept beside the arithmetic so the
 * wording and the numbers are reviewed together.
 *
 * "1,240 stickers · 45 signs · 96 garments" — mono spec furniture, no verb,
 * no adjective. The eyebrow above it says what the numbers are.
 */
export function describePressActivity(activity: PressActivity): string {
  return activity.counts
    .map((entry) => `${entry.quantity.toLocaleString()} ${entry.noun}`)
    .join(" · ");
}
