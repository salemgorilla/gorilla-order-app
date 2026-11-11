import { getReferenceStickerPrice, REFERENCE_STICKER } from "./reference-quote";
import { paperProducts } from "./paper";
import { signsPricingConfig } from "./signs-pricing-config";
import { apparelPricingConfig } from "./apparel-pricing-config";
import { turnaroundRules } from "./turnaround";
import { LANDING_PHOTOS, type LandingPhoto } from "./landing-photos";

/**
 * THE LANDING PAGE'S DATA — one place, and every figure in it is read from the
 * config that bills, never typed in.
 *
 * ── WHY THIS IS A FILE AND NOT JSX ────────────────────────────────────────
 * A landing page is where a shop says "from $X" and "ready by Y" to people who
 * have not yet spent a minute on the form. Those numbers move: the 3% retail
 * uplift (2026-11-11) moved every one of them. A price typed into a component
 * would be the stale copy on the day it matters, so the page holds no
 * literals: `from` figures come from the pricing configs, turnaround from
 * lib/turnaround, sizes from the paper catalogue. tests/landing.test.ts holds
 * that to account.
 *
 * ── "THE FULL LINE ON ONE PAGE, AS THUMBS" (Gabe, 2026-11-11) ─────────────
 * Every thing the shop can be asked for, once, as a drawing with a code and
 * one honest line of spec. An offering that is not live is NOT here: no
 * embroidery, no "coming soon" — a thumbnail is a promise.
 *
 * ── WHAT EACH OFFERING DOES WHEN CLICKED ──────────────────────────────────
 * It starts the flow it belongs to (`productId` is a productCategories id, so
 * the existing selectProduct path runs and nothing about checkout changes).
 * `how` says in the customer's terms what they will get — "instant price" or
 * "hand quote" — and is derived from the SAME status the product card reads.
 */

export type SpecimenKind =
  | "sticker"
  | "banner"
  | "yard-sign"
  | "rigid-sign"
  | "poster"
  | "window"
  | "tee"
  | "business-card"
  | "rack-card"
  | "postcard"
  | "brochure"
  | "menu"
  | "letterhead";

export type Offering = {
  /** The shop's own shorthand. Mono furniture; each one is unique. */
  code: string;
  name: string;
  specimen: SpecimenKind;
  /** A productCategories id — what clicking this selects. */
  productId: "stickers" | "apparel" | "banners" | "signs" | "paper";
  /** One line, values only. Derived. */
  spec: string;
  /** Read off the pricing engine ("price") or hand-quoted ("quote"). */
  how: "price" | "quote";
};

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function paperSpec(id: string): string {
  const product = paperProducts.find((p) => p.id === id);
  if (!product) throw new Error(`landing: no paper product ${id}`);

  const sizes = product.sizes.map((s) => s.label.replace(/ \(.*\)$/, "")).join(" · ");
  return sizes;
}

/** The whole line. Order is the order on the page. */
export function buildOfferings(): Offering[] {
  const cfg = signsPricingConfig;
  const rigidRates = Object.values(cfg.rigid.perSqftByMaterial);

  return [
    {
      code: "STK",
      name: "Die-cut stickers",
      specimen: "sticker",
      productId: "stickers",
      spec: `${REFERENCE_STICKER.label} from ${money(getReferenceStickerPrice())}`,
      how: "price",
    },
    {
      code: "BNR",
      name: "Vinyl banners",
      specimen: "banner",
      productId: "banners",
      spec: `Hemmed + grommets · from ${money(cfg.minimumOrder.banners)}`,
      how: "price",
    },
    {
      code: "YRD",
      name: "Yard signs",
      specimen: "yard-sign",
      productId: "signs",
      spec: `18" × 24" corrugated · from ${money(cfg.minimumOrder.signs)}`,
      how: "price",
    },
    {
      code: "RGD",
      name: "Rigid signs",
      specimen: "rigid-sign",
      productId: "signs",
      spec: `${rigidRates.length} materials · from ${money(Math.min(...rigidRates))}/sq ft`,
      how: "price",
    },
    {
      code: "PST",
      name: "Posters",
      specimen: "poster",
      productId: "signs",
      spec: `${money(cfg.poster.perSqft)}/sq ft`,
      how: "price",
    },
    {
      code: "WIN",
      name: "Window graphics",
      specimen: "window",
      productId: "signs",
      spec: "Priced to your opening",
      how: "quote",
    },
    {
      code: "TEE",
      name: "Tees & hoodies",
      specimen: "tee",
      productId: "apparel",
      spec: `Screen printed · up to ${apparelPricingConfig.maxColorsPerLocation} colours a placement`,
      how: "quote",
    },
    {
      code: "BCD",
      name: "Business cards",
      specimen: "business-card",
      productId: "paper",
      spec: paperSpec("business-cards"),
      how: "quote",
    },
    {
      code: "RCK",
      name: "Rack cards",
      specimen: "rack-card",
      productId: "paper",
      spec: paperSpec("rack-cards"),
      how: "quote",
    },
    {
      code: "PCD",
      name: "Postcards",
      specimen: "postcard",
      productId: "paper",
      spec: paperSpec("postcards"),
      how: "quote",
    },
    {
      code: "TRI",
      name: "Trifold brochures",
      specimen: "brochure",
      productId: "paper",
      spec: paperSpec("brochures"),
      how: "quote",
    },
    {
      code: "MNU",
      name: "Menus",
      specimen: "menu",
      productId: "paper",
      spec: paperSpec("menus"),
      how: "quote",
    },
    {
      code: "LTR",
      name: "Letterhead",
      specimen: "letterhead",
      productId: "paper",
      spec: paperSpec("letterhead"),
      how: "quote",
    },
  ];
}

/**
 * The five steps, as the form actually runs them (lib/steps.ts), each with the
 * one fact a customer wants before committing to it. Not marketing: the
 * artefact at the end of each step is a thing that really exists.
 */
export const QUOTE_RUN = [
  { n: "01", step: "Pick", artefact: "A product, and whether it is priced online or by hand" },
  { n: "02", step: "Details", artefact: "Size and quantity — the price moves as you change them" },
  { n: "03", step: "Artwork", artefact: "Your file, checked; a magenta cut line for die cuts" },
  { n: "04", step: "Contact", artefact: "Who we write to, and the date you need it by" },
  { n: "05", step: "Review", artefact: "A quote number, GS-YYYYMMDD-XXXXXXXX, and a proof before print" },
] as const;

/** What a customer is promised about time, from the lanes the order is held to. */
export function turnaroundFacts(): Array<{ products: string; promise: string }> {
  return [
    { products: turnaroundRules.fast.products, promise: turnaroundRules.fast.promise },
    { products: turnaroundRules.slow.products, promise: turnaroundRules.slow.promise },
  ];
}

/**
 * THE FIVE PANELS — one per product family, in the order the shop sells them.
 *
 * "Something like this but with various products" (Gabe, 2026-11-11, showing a
 * row of tall full-height photo panels, one per print process, each with a big
 * centred label). Ours is one per FAMILY because that is what the shop has:
 * exactly the five productCategories. A panel starts the same flow its product
 * card starts. `lines` is the label, broken the way it is set; `spec` is one
 * line of values, read from the config that bills; `photo` is null until the
 * shop supplies one (lib/landing-photos.ts).
 */
export type Panel = {
  productId: Offering["productId"];
  /** The label, as it is set across the bottom of the panel. */
  lines: [string, string];
  spec: string;
  /** What to draw when there is no photograph. */
  emblem: SpecimenKind;
  photo: LandingPhoto | null;
};

export function buildPanels(): Panel[] {
  const cfg = signsPricingConfig;

  return [
    {
      productId: "stickers",
      lines: ["Custom", "Stickers"],
      spec: `from ${money(getReferenceStickerPrice())} · ${REFERENCE_STICKER.label}`,
      emblem: "sticker",
      photo: LANDING_PHOTOS.stickers ?? null,
    },
    {
      productId: "apparel",
      lines: ["Tees &", "Hoodies"],
      spec: `screen printed · up to ${apparelPricingConfig.maxColorsPerLocation} colours a placement`,
      emblem: "tee",
      photo: LANDING_PHOTOS.apparel ?? null,
    },
    {
      productId: "banners",
      lines: ["Vinyl", "Banners"],
      spec: `from ${money(cfg.minimumOrder.banners)} · hemmed + grommets`,
      emblem: "banner",
      photo: LANDING_PHOTOS.banners ?? null,
    },
    {
      productId: "signs",
      lines: ["Signs &", "Posters"],
      spec: `from ${money(cfg.minimumOrder.signs)} · yard, rigid, window`,
      emblem: "yard-sign",
      photo: LANDING_PHOTOS.signs ?? null,
    },
    {
      productId: "paper",
      lines: ["Paper", "Printing"],
      spec: "cards, postcards, brochures, menus",
      emblem: "business-card",
      photo: LANDING_PHOTOS.paper ?? null,
    },
  ];
}
