import { AddOn } from "../types/order";
import { getStickerPrice } from "./pricing";
import { calculateSignsPricing } from "./signs-pricing";

/**
 * "Add to this quote" — the cross-sell catalogue.
 *
 * TWO RULES, both load-bearing:
 *
 * 1. Prices are COMPUTED by calling the real engines, never typed in here.
 *    signs-pricing-config.ts says "EDIT PRICES HERE. Nothing else needs to
 *    change when rates move." This file keeps that true — change a rate on
 *    the price board, and these offers follow.
 *
 * 2. Labels must be plain ASCII and must NOT contain ": ".
 *    lib/email.ts splits every row on the first ": " to build the HTML table,
 *    and lib/printavo.ts deletes any character outside \x20-\x7E (so "Café"
 *    arrives as "Caf"). Keep labels boring.
 *
 * Add-ons are quote requests, not purchases. Nothing here changes the
 * customer's estimate or blocks submission.
 */

export type AddOnOffer = {
  id: string;
  label: string;
  detail: string;
  /** Which product flows this offer appears in. */
  flows: Array<"stickers" | "signs" | "apparel">;
  price: () => { amount: number; quoteRequired: boolean };
};

const handQuote = () => ({ amount: 0, quoteRequired: true });

/** A 3ft x 6ft hemmed + grommeted banner, priced by the real signs engine. */
function bannerPrice() {
  const result = calculateSignsPricing({
    method: "banner",
    quantity: 1,
    sizeKey: "3' x 6'",
    widthInches: 36,
    heightInches: 72,
    material: "13 oz Scrim Vinyl",
    doubleSided: false,
    stepStakes: false,
    isCustomSize: false,
    bannerAddOns: [],
  });

  // If the engine ever declines to price this (a rate removed from the config,
  // say), fall back to a hand quote rather than offering a confident $0.
  if (!result.priceable || result.total <= 0) return handQuote();

  return { amount: Math.round(result.total), quoteRequired: false };
}

/** Stickers at a fixed pack size, priced by the real sticker engine. */
function stickerPackPrice(quantity: number) {
  return () => ({
    // Gloss white vinyl, gloss finish — the shop's default stock.
    // 3" explicitly — the add-on offer names that size in its label.
    amount: getStickerPrice(quantity, "Gloss White Vinyl", "Gloss", '3"'),
    quoteRequired: false,
  });
}

export const ADD_ON_CATALOG: AddOnOffer[] = [
  {
    id: "banner-3x6",
    label: "3ft x 6ft vinyl banner, hemmed with grommets",
    detail: "Same artwork. Good for the front of a building or a fence line.",
    flows: ["stickers", "apparel"],
    price: bannerPrice,
  },
  {
    id: "stickers-100",
    label: "100 die-cut stickers, 3 inch, gloss white vinyl",
    detail: "Same artwork, cut to shape.",
    flows: ["signs", "apparel"],
    price: stickerPackPrice(100),
  },
  {
    id: "stickers-250",
    label: "250 die-cut stickers, 3 inch, gloss white vinyl",
    detail: "Same artwork. Better per-sticker price than 100.",
    flows: ["signs", "apparel"],
    price: stickerPackPrice(250),
  },
  {
    id: "window-decal",
    label: "Window or door decal",
    detail: "Hours, logo or a promo. Priced to your opening.",
    flows: ["stickers", "signs", "apparel"],
    price: handQuote,
  },
  {
    id: "apparel-screenprint",
    label: "Screen printed tees or hoodies",
    detail: "Same artwork on garments. We quote these by hand.",
    flows: ["stickers", "signs"],
    price: handQuote,
  },
];

/** The offers shown for a given flow, capped so the strip stays scannable. */
export function getAddOnOffers(flow: string): AddOnOffer[] {
  const key = flow === "decals" ? "stickers" : flow;
  return ADD_ON_CATALOG.filter((offer) =>
    offer.flows.includes(key as AddOnOffer["flows"][number])
  ).slice(0, 4);
}

/** Materialise an offer into the record that rides along with the order. */
export function toAddOn(offer: AddOnOffer): AddOn {
  const { amount, quoteRequired } = offer.price();
  return { id: offer.id, label: offer.label, amount, quoteRequired };
}

/**
 * Two figures, never merged into one. A dollar total that quietly absorbed
 * three unpriced items would read as the whole cost of the add-ons.
 */
export function summariseAddOns(addOns: AddOn[]) {
  const priced = addOns.reduce(
    (sum, a) => sum + (a.quoteRequired ? 0 : a.amount),
    0
  );
  const quoteCount = addOns.filter((a) => a.quoteRequired).length;
  return { priced, quoteCount };
}
