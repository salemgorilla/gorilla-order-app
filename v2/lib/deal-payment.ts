/**
 * BLACK FRIDAY DEALS ARE PAID IN FULL, UP FRONT — a policy, not an option.
 *
 * Gabe, 2026-11-24: "I want the Black Friday deals to be pay in full as a
 * policy rule", then "Same with the 50 hoody deal: 100% paid in full, up
 * front."
 *
 * So every deal (the 50 stickers, the tee deals, the 50 Hoodie Special, and
 * the beanies and hats when they open) is paid in full at checkout through
 * the same Printavo payment link stickers use: no deposit, no pay-later.
 * lib/auto-bill.ts decides it; this file holds the words every surface shows
 * and the list a new deal has to join before it can open (tests/deals.test.ts
 * fails on a deal start that is missing from it).
 */
export const DEAL_PAYMENT_TERMS = "Paid in full, 100% up front, at checkout.";

/** Shorter, for a card row. */
export const DEAL_PAYMENT_ROW = "100% up front, paid in full at checkout";

/**
 * Every deal start that can take an order, and the gate that bills it in
 * full. A start missing here cannot pass tests/deals.test.ts.
 */
export const PAY_IN_FULL_STARTS = {
  "stickers-deal": "stickers",
  "hoodie-special": "deal",
  "tees-12-1c": "deal",
  "tees-24-1c": "deal",
  "tees-24-2c": "deal",
} as const;
