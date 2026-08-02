import { signsPricingConfig } from "./signs-pricing-config";

export type SignsPricingInput = {
  /** "yard" = per-unit corrugated table; the rest are per square foot. */
  method: "yard" | "banner" | "poster" | "rigid";
  quantity: number;
  /** Yard signs: the size key that matches signsPricingConfig.yardSigns.sizes */
  sizeKey?: string;
  /** Square-foot products: finished size of ONE piece. */
  widthInches?: number;
  heightInches?: number;
  /** Rigid signs: material key from perSqftByMaterial. */
  material?: string;
  doubleSided: boolean;
  /** Yard signs only. */
  stepStakes?: boolean;
  isCustomSize: boolean;
  /** Banner finishing add-on keys (see signsPricingConfig.banner.addOns). */
  bannerAddOns?: string[];
};

export type SignsPricingLine = { label: string; amount: number };

export type SignsPricingResult = {
  /** False when we can't price the configuration (unknown size/material). */
  priceable: boolean;
  reason?: string;
  lines: SignsPricingLine[];
  subtotal: number;
  total: number;
  unitPrice: number;
  sqftEach: number;
  note: string;
  /**
   * True when the customer picked an add-on the shop quotes by hand, so the
   * total is a floor ("from $X") rather than the finished price.
   */
  hasQuotedExtras?: boolean;
  /** Shown when a big banner should probably be reinforced. */
  suggestions?: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Square feet for one piece, from inches. */
export function sqftFromInches(widthInches: number, heightInches: number) {
  if (!widthInches || !heightInches) return 0;
  return (widthInches * heightInches) / 144;
}

/** Per-sign price from the corrugated quantity table. */
export function getYardSignUnitPrice(
  sizeKey: string,
  quantity: number,
  doubleSided: boolean
): number | null {
  const size = signsPricingConfig.yardSigns.sizes[sizeKey];
  if (!size) return null;

  if (quantity <= 1) {
    // The boards only show a single-sided "each" price for one sign, so a
    // one-off double-sided sign falls back to the 2–5 double rate rather than
    // inventing a number.
    if (!doubleSided) return size.singleUnitPrice;
    const smallest = [...size.tiers].sort(
      (a, b) => a.minQuantity - b.minQuantity
    )[0];
    return smallest ? smallest.double : null;
  }

  const tier = [...size.tiers]
    .sort((a, b) => b.minQuantity - a.minQuantity)
    .find((t) => quantity >= t.minQuantity);

  if (!tier) return size.singleUnitPrice;
  return doubleSided ? tier.double : tier.single;
}

export function calculateSignsPricing(
  input: SignsPricingInput
): SignsPricingResult {
  const cfg = signsPricingConfig;
  const quantity = Math.max(1, Math.floor(input.quantity || 1));
  const lines: SignsPricingLine[] = [];

  const empty = (reason: string): SignsPricingResult => ({
    priceable: false,
    reason,
    lines: [],
    subtotal: 0,
    total: 0,
    unitPrice: 0,
    sqftEach: 0,
    note: cfg.taxNote,
  });

  let productTotal = 0;
  let sqftEach = 0;

  if (input.method === "yard") {
    const sizeKey = input.sizeKey || "";
    const unit = getYardSignUnitPrice(sizeKey, quantity, input.doubleSided);

    if (unit === null) {
      return empty(
        "This sign size is priced by hand — Gorilla Salem will confirm it."
      );
    }

    productTotal = unit * quantity;
    lines.push({
      label: `${quantity} × ${sizeKey} ${
        input.doubleSided ? "double-sided" : "single-sided"
      } @ $${unit.toFixed(2)}`,
      amount: round2(productTotal),
    });

    if (input.stepStakes) {
      const stakes = cfg.yardSigns.stepStakePerSign * quantity;
      productTotal += stakes;
      lines.push({
        label: `Step stakes (${quantity} × $${cfg.yardSigns.stepStakePerSign})`,
        amount: round2(stakes),
      });
    }
  } else {
    sqftEach = sqftFromInches(
      input.widthInches || 0,
      input.heightInches || 0
    );

    if (sqftEach <= 0) {
      return empty("Enter a width and height so we can price it.");
    }

    let perSqft: number | undefined;

    if (input.method === "banner")
      // Falls back to the flat rate so an unlisted material still prices,
      // rather than dropping into the "quoted by hand" branch below.
      perSqft =
        cfg.banner.perSqftByMaterial[input.material || ""] ??
        cfg.banner.perSqft;
    else if (input.method === "poster") perSqft = cfg.poster.perSqft;
    else perSqft = cfg.rigid.perSqftByMaterial[input.material || ""];

    if (perSqft === undefined) {
      return empty(
        "This material is priced by hand — Gorilla Salem will confirm it."
      );
    }

    // Double-sided is a per-sqft surcharge (rigid + banner).
    const takesDoubleSurcharge =
      input.doubleSided &&
      (cfg.doubleSidedMethods as readonly string[]).includes(input.method);

    const effectivePerSqft = takesDoubleSurcharge
      ? perSqft + cfg.doubleSidedPerSqft
      : perSqft;

    const totalSqft = sqftEach * quantity;
    productTotal = effectivePerSqft * totalSqft;

    lines.push({
      label: `${quantity} × ${sqftEach.toFixed(2)} sqft @ $${effectivePerSqft.toFixed(
        2
      )}/sqft`,
      amount: round2(productTotal),
    });

    if (takesDoubleSurcharge) {
      lines.push({
        label: `(includes +$${cfg.doubleSidedPerSqft}/sqft double-sided)`,
        amount: 0,
      });
    }
  }

  // ---- banner finishing add-ons ----
  let hasQuotedExtras = false;
  const suggestions: string[] = [];

  if (input.method === "banner" && input.bannerAddOns?.length) {
    for (const key of input.bannerAddOns) {
      const addOn =
        cfg.banner.addOns[key as keyof typeof cfg.banner.addOns];
      if (!addOn) continue;

      if (addOn.quoteByHand) {
        hasQuotedExtras = true;
        lines.push({ label: `${addOn.label} — quoted separately`, amount: 0 });
        continue;
      }

      // Finishing is per banner, so it scales with quantity.
      const amount = addOn.flat * quantity;
      productTotal += amount;
      lines.push({
        label:
          quantity > 1
            ? `${addOn.label} (${quantity} × $${addOn.flat})`
            : addOn.label,
        amount: round2(amount),
      });
    }
  }

  if (
    input.method === "banner" &&
    sqftEach * quantity > cfg.banner.recommendReinforcementOverSqft
  ) {
    suggestions.push(
      "Banners this large usually need reinforcement (webbing or rope) — we'll confirm what's best."
    );
  }

  // ---- order-level fees ----
  lines.push({ label: "Setup fee", amount: cfg.setupFee });
  let total = productTotal + cfg.setupFee;

  // Custom size fee is hard stock only — a custom size leaves drop pieces when
  // cut from a 48" x 96" sheet. Banners and posters print on roll material, so
  // a custom size costs nothing extra there.
  const isHardStock = (
    cfg.hardStockMethods as readonly string[]
  ).includes(input.method);

  if (input.isCustomSize && isHardStock) {
    lines.push({ label: "Custom size fee", amount: cfg.customSizeFee });
    total += cfg.customSizeFee;
  }

  return {
    priceable: true,
    lines,
    subtotal: round2(productTotal),
    total: round2(total),
    unitPrice: round2(total / quantity),
    sqftEach: round2(sqftEach),
    note: cfg.taxNote,
    hasQuotedExtras,
    suggestions,
  };
}
