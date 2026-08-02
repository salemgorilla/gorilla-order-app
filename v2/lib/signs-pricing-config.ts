// Signs & Banners pricing — taken from Gorilla Salem's in-shop price boards.
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
  /** Flat setup fee applied once per signs order (all sign types). */
  setupFee: 15,

  /**
   * Custom size fee — charged once when a non-standard size would leave drop
   * pieces when cut from a sheet. HARD STOCK ONLY (rigid + corrugated);
   * banners and posters print on roll material, so they never incur it.
   */
  customSizeFee: 20,

  /** Sheet stock Gorilla buys. Custom sizes that don't nest into this leave drop. */
  sheetStockInches: { width: 48, height: 96 },

  /** Methods cut from sheet stock, i.e. the ones the custom size fee applies to. */
  hardStockMethods: ["yard", "rigid"] as const,

  /**
   * Double-sided surcharge, per square foot, for the $/sqft products.
   * (Yard signs are not included — their table already has its own
   * double-sided column.)
   */
  doubleSidedPerSqft: 7,
  doubleSidedMethods: ["rigid", "banner"] as const,

  // ---------------- Corrugated / yard signs (priced per unit) -------------
  yardSigns: {
    stepStakePerSign: 2,

    sizes: {
      '18" x 24"': {
        singleUnitPrice: 28,
        tiers: [
          { minQuantity: 30, single: 10, double: 16 },
          { minQuantity: 20, single: 11, double: 17 },
          { minQuantity: 10, single: 12, double: 18 },
          { minQuantity: 6, single: 14, double: 20 },
          { minQuantity: 2, single: 23, double: 40 },
        ],
      },
      '24" x 36"': {
        singleUnitPrice: 32,
        tiers: [
          { minQuantity: 40, single: 12.5, double: 15 },
          { minQuantity: 30, single: 13.5, double: 16.5 },
          { minQuantity: 20, single: 15, double: 19 },
          { minQuantity: 10, single: 22, double: 27 },
          { minQuantity: 6, single: 29, double: 39 },
          { minQuantity: 2, single: 31, double: 50 },
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
    perSqft: 8,

    /**
     * Per-material rates. Banners used to be a single flat rate regardless of
     * material — this mirrors the rigid.perSqftByMaterial pattern so heavier
     * stock can carry its own price.
     *
     * 18 oz is the standard rate + $3/sqft.
     */
    perSqftByMaterial: {
      "13 oz Scrim Vinyl": 8,
      "18 oz Heavy Duty Vinyl": 11, // standard rate + $3/sqft
      "Mesh Vinyl (windy areas)": 8, // unchanged — was already the flat rate
    } as Record<string, number>,

    /**
     * The sqft rate includes hems. 18 oz is heavy enough not to need them, so
     * skipping the hem credits back the labour: $2 per linear foot of edge,
     * i.e. the banner's perimeter, per banner.
     *
     * A 3' x 6' banner has an 18 ft perimeter, so the credit is $36.
     */
    noHemCreditPerLinearFoot: 2,

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
        constructionPerLinearFoot: 10,
      },
    } as Record<
      string,
      { method: "surcharge" | "sewn"; constructionPerLinearFoot?: number }
    >,

    /**
     * Finishing add-ons. Hems and standard grommets are INCLUDED in the sqft
     * rate (matches the shop board: "$8 per sqft — includes grommets").
     *
     * Prices CONFIRMED by Gorilla Salem 2026-07-31.
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
        quoteByHand: true,
      },
    },

    /** Above this many sqft, suggest reinforcement. */
    recommendReinforcementOverSqft: 100,
  },

  poster: {
    perSqft: 5,
  },

  rigid: {
    // Price per square foot by material, from the rigid sign board.
    perSqftByMaterial: {
      'PVC 1/8"': 8,
      'Corrugated 1/4"': 8,

      'Dibond 1/8"': 10,
      'PVC 1/4"': 10,
      'AlumaCorr 0.2"': 10,
      "Aluminum 040": 10,
      'Corrugated 1/2"': 10,

      'PVC 1/2"': 12,
      'AlumaCorr 0.4"': 12,
      "Aluminum 080": 12,
      'Dibond 1/4"': 12,
    } as Record<string, number>,

    /** Added per square foot when printed both sides. */
    doubleSidedPerSqft: 7,
  },

  /** Shown on every signs estimate. */
  taxNote: "Tax not included.",
};
