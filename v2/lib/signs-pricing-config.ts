// Signs & Banners pricing — taken from Gorilla Salem's in-shop price boards,
// then raised 10% on 2026-08-02 and rounded up to the nearest $0.50. The
// printed shop boards still show the pre-raise rates and will not match this
// file until they are reprinted.
//
// The two banner finishing add-ons (pole pockets, wind slits) are EXCLUDED
// from that raise — see the note on `addOns` below.
//
// EDIT PRICES HERE. Nothing else needs to change when rates move.
//
// Tier rule: tiers are ranges. `minQuantity: 10` means 10–19, `20` means
// 20–29, and the largest tier is open-ended (30+ / 40+).

export type SignQuantityTier = {
  minQuantity: number;
  single: number; // price EACH, single-sided
  double: number; // price EACH, double-sided
};

export type YardSignSizePricing = {
  /** Price for a single sign (qty 1), single-sided. */
  singleUnitPrice: number;
  tiers: SignQuantityTier[];
};

export const signsPricingConfig = {
  // ---------------- Order-level fees (from the PRICING GUIDE board) -------
  /**
   * Setup, PER DESIGN, on every signs and banners order — every sign type,
   * every size, standard or not. Gabe set this on 2026-08-22, replacing a
   * $16.50 order fee plus a $22 custom size fee.
   *
   * "Per design" and "per order" are the same number today: the signs builder
   * takes ONE artwork or ONE template per quote, unlike the sticker cart,
   * which carries several designs and prices setup per design in
   * lib/pricing.ts. If signs ever grow a multi-design cart, this fee is
   * charged per design in it, and the line label already says so.
   */
  setupFee: 15,

  /**
   * ORDER MINIMUMS, by pipeline — Gabe, 2026-09-05.
   *
   *   signs    $60   yard signs, rigid signs, posters, window graphics
   *   banners  $45   vinyl banners
   *
   * Applied to the whole quote, once, after the design totals and setup are
   * summed and before rush and tax (lib/signs-cart.ts): a quote that comes
   * to less is priced AT the minimum, with a "Minimum order" line making up
   * the difference. The top-up is the price of the goods, not a separately
   * stated service, so it is TAXED like the goods — unlike setup, add-ons
   * and rush, which are fees and are not (lib/tax.ts).
   *
   * Why it exists: a 1' x 2' banner priced at $18 + $15 setup, and one
   * 18" x 24" yard sign at $46. Small orders take the same set-up, proofing
   * and handling as large ones, and those figures were under what the work
   * costs. Chosen over a floor on the no-hem credit (PRICING.md, D10) as the
   * trade's standard answer to the same problem.
   */
  minimumOrder: {
    signs: 60,
    banners: 45,
  } as Record<"signs" | "banners", number>,

  /**
   * Double-sided surcharge, per square foot, for the $/sqft products.
   * (Yard signs are not included — their table already has its own
   * double-sided column.)
   */
  doubleSidedPerSqft: 8,
  doubleSidedMethods: ["rigid", "banner"] as const,

  // ---------------- Corrugated / yard signs (priced per unit) -------------
  yardSigns: {
    stepStakePerSign: 2.5,

    sizes: {
      '18" x 24"': {
        singleUnitPrice: 31,
        tiers: [
          { minQuantity: 30, single: 11, double: 18 },
          { minQuantity: 20, single: 12.5, double: 19 },
          { minQuantity: 10, single: 13.5, double: 20 },
          { minQuantity: 6, single: 15.5, double: 22 },
          { minQuantity: 2, single: 25.5, double: 44 },
        ],
      },
      '24" x 36"': {
        singleUnitPrice: 35.5,
        tiers: [
          { minQuantity: 40, single: 14, double: 16.5 },
          { minQuantity: 30, single: 15, double: 18.5 },
          { minQuantity: 20, single: 16.5, double: 21 },
          { minQuantity: 10, single: 24.5, double: 30 },
          { minQuantity: 6, single: 32, double: 43 },
          { minQuantity: 2, single: 34.5, double: 55 },
        ],
      },
    } as Record<string, YardSignSizePricing>,
  },

  // ---------------- Square-foot priced products --------------------------
  banner: {
    /**
     * Fallback rate, used for any banner material without an explicit rate
     * below. Includes hems + standard grommets.
     */
    perSqft: 9,

    /**
     * Per-material rates. Banners used to be a single flat rate regardless of
     * material — this mirrors the rigid.perSqftByMaterial pattern so heavier
     * stock can carry its own price.
     *
     * 18 oz is the standard rate + $3.50/sqft (was +$3 before the raise).
     */
    perSqftByMaterial: {
      "13 oz Scrim Vinyl": 9,
      "18 oz Heavy Duty Vinyl": 12.5, // standard rate + $3.50/sqft
      "Mesh Vinyl (windy areas)": 9, // same as 13 oz
    } as Record<string, number>,

    /**
     * The sqft rate includes hems. 18 oz is heavy enough not to need them, so
     * skipping the hem credits back the labour: $2.50 per linear foot of edge,
     * i.e. the banner's perimeter, per banner.
     *
     * A 3' x 6' banner has an 18 ft perimeter, so the credit is $45.
     */
    noHemCreditPerLinearFoot: 2.5,

    /** The finishing option that means "no hem" (must match signs.ts). */
    noHemFinishingLabel: "No Hem or Grommets",

    /**
     * Only these banner materials may skip the hem. 13 oz and mesh always get
     * hemmed — they need the reinforced edge to survive, so the option is not
     * offered and the credit never applies to them.
     */
    noHemMaterials: ["18 oz Heavy Duty Vinyl"] as string[],

    /**
     * How each banner material can be printed double-sided. A material absent
     * from this map cannot be double-sided at all (mesh is perforated, so
     * there is nothing to block show-through).
     *
     *   "surcharge" — printed both sides on one panel, at the standard
     *                 doubleSidedPerSqft rate. 18 oz is opaque enough.
     *
     *   "sewn"      — 13 oz shows through, so it is two banners sewn back to
     *                 back: double the material, plus a construction charge
     *                 per linear foot of sewn edge (the perimeter).
     *
     * Rigid, corrugated and the other sign types are unaffected — this map is
     * banner-only.
     */
    doubleSided: {
      "18 oz Heavy Duty Vinyl": { method: "surcharge" as const },
      "13 oz Scrim Vinyl": {
        method: "sewn" as const,
        constructionPerLinearFoot: 11,
      },
    } as Record<
      string,
      { method: "surcharge" | "sewn"; constructionPerLinearFoot?: number }
    >,

    /**
     * Finishing add-ons. Hems and standard grommets are INCLUDED in the sqft
     * rate.
     *
     * These two came from market research rather than the shop board, and are
     * DELIBERATELY EXCLUDED from the 10% raise of 2026-08-02 — Gabe confirmed
     * them as Gorilla's own rates in v3.14.0 and asked to leave them as they
     * are. Do not sweep them into a future across-the-board raise without
     * asking.
     *
     *   pole pockets  $15 flat per banner
     *   wind slits    $6 flat per banner
     *   webbing/D-rings/rope: quoted by hand, recommended over ~100 sqft
     */
    addOns: {
      polePockets: { label: "Pole Pockets", flat: 15, quoteByHand: false },
      windSlits: { label: "Wind Slits", flat: 6, quoteByHand: false },
      reinforcedWebbing: {
        label: "Webbing / D-Rings / Rope",
        flat: 0,
        quoteByHand: false,
        // Priced by the linear foot of EDGE, because that is what the work
        // actually is — webbing is sewn around the perimeter, so it scales
        // with the distance around the banner, not with its area.
        //
        //   24" x 96"  ->  2 x (24 + 96) = 240" = 20 linear ft
        //   20 ft x $6 = $120
        perLinearFoot: 6,
      },
    },

    /** Above this many sqft, suggest reinforcement. */
    recommendReinforcementOverSqft: 100,
  },

  poster: {
    perSqft: 5.5,
  },

  rigid: {
    // Price per square foot by material, from the rigid sign board.
    perSqftByMaterial: {
      'PVC 1/8"': 9,
      'Corrugated 1/4"': 9,

      'Dibond 1/8"': 11,
      'PVC 1/4"': 11,
      'AlumaCorr 0.2"': 11,
      "Aluminum 040": 11,
      'Corrugated 1/2"': 11,

      'PVC 1/2"': 13.5,
      'AlumaCorr 0.4"': 13.5,
      "Aluminum 080": 13.5,
      'Dibond 1/4"': 13.5,
    } as Record<string, number>,

    /** Added per square foot when printed both sides. */
    doubleSidedPerSqft: 8,
  },

  /**
   * Shown on every signs estimate, under the totals.
   *
   * It read "Tax not included." while the card directly above it printed an
   * estimated tax row and a tax-INCLUSIVE total — true when it was written,
   * false since the tax line landed, and flatly contradicting the number
   * beside it. Now it says which part of the bill the tax is on, which is
   * the question a customer actually has after this change: setup and rush
   * are fees, and fees are untaxed (Gabe, 2026-09-04).
   */
  taxNote: "Tax is estimated on the signs; setup and rush are not taxed.",
};
