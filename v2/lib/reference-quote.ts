import { getStickerPrice } from "./pricing";

/**
 * The reference order the entry screen anchors its price on.
 *
 * ── WHY A REFERENCE ORDER EXISTS ──────────────────────────────────────────
 * The step-01 brief's highest-leverage finding: there was no price anywhere
 * until step 5, so a visitor decided whether to invest five steps of effort
 * against an invisible payoff — the standard failure mode for multi-step
 * quote builders. The anchor answers "$60 or $600?" before the first click.
 *
 * ── THE NON-NEGOTIABLE, FROM THE BRIEF ────────────────────────────────────
 * "The figure must be derived from the same quote engine that produces the
 * invoice. Not a constant, not a duplicated formula, not a CMS field." This
 * app bills stickers automatically; if the entry-screen number and the
 * Printavo invoice can disagree, they eventually will. So the SPEC below is
 * data and the PRICE is always computed — change a rate in lib/pricing.ts
 * and the hero moves with the invoice, no second edit.
 *
 * ── THE SPEC IS GABE'S TO CHANGE ──────────────────────────────────────────
 * "100 die-cut 3-inch gloss white" is the brief's own suggestion, and it is
 * already the shop's public reference: the cross-sell strip has quoted this
 * exact pack at its engine price to every signs and apparel customer since
 * add-ons shipped. Anchoring the hero on the same spec exposes no new
 * number. If a different spec better represents a typical first order, edit
 * THIS OBJECT — nothing else needs touching, and tests/reference-quote
 * checks the label still tells the truth about the spec.
 */
export const REFERENCE_STICKER = {
  /** What the hero calls it. Kept truthful against the spec by a test. */
  label: '100 die-cut 3" stickers',
  quantity: 100,
  material: "Gloss White Vinyl",
  finish: "Gloss",
  size: '3"',
} as const;

/**
 * The anchored figure: the reference order's full price — setup included,
 * local pickup, before tax — from the one engine the invoice uses.
 */
export function getReferenceStickerPrice(): number {
  return getStickerPrice(
    REFERENCE_STICKER.quantity,
    REFERENCE_STICKER.material,
    REFERENCE_STICKER.finish,
    REFERENCE_STICKER.size
  );
}
