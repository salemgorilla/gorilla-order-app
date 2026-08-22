import { signsPricingConfig } from "./signs-pricing-config";
import { allowsReinforcement, REINFORCEMENT_ADD_ON_KEY } from "./signs";

export type SignsPricingInput = {
  /** "yard" = per-unit corrugated table; the rest are per square foot. */
  method: "yard" | "banner" | "poster" | "rigid";
  quantity: number;
  /** Yard signs: the size key that matches signsPricingConfig.yardSigns.sizes */
  sizeKey?: string;
  /** Square-foot products: finished size of ONE piece. */
  widthInches?: number;
  heightInches?: number;
  /** Rigid AND banner signs: material key from the relevant perSqftByMaterial. */
  material?: string;
  doubleSided: boolean;
  /** Yard signs only. */
  stepStakes?: boolean;
  /** The chosen finishing label. Banners use it for the no-hem credit. */
  finishing?: string;
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
  /**
   * Yard signs only. Set when the order was priced at a LARGER quantity's
   * rate because that came out cheaper — see getYardSignPrice. Carries the
   * quantity the price was taken from, so the UI can say so.
   */
  pricedAtQuantity?: number;
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

export type YardSignPrice = {
  /** The per-sign rate actually applied. */
  unitPrice: number;
  /** The quantity that rate was taken from. Never less than what was asked. */
  chargedQuantity: number;
  total: number;
};

/**
 * What a run of yard signs costs, with the never-pay-more rule applied.
 *
 * ── THE PROBLEM ───────────────────────────────────────────────────────────
 * The board is a per-unit tier table, and a tier boundary makes the TOTAL go
 * backwards. Five 18" x 24" signs were $127.50 and six were $93.00, because
 * five pays the 2-5 rate of $25.50 and six pays the 6-9 rate of $15.50. The
 * same happened at 9/10, 19/20 and 29/30 — someone ordering 29 signs paid
 * $32.50 more than someone ordering 30.
 *
 * That is normal for a tier table and it is not a mistake in the rates. It is
 * a bad thing to leave in front of a customer: either they notice, and the
 * shop looks like it is charging for arithmetic nobody checked, or they do
 * not, and they overpay for ordering the amount they actually wanted.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * You are never charged more than you would be charged for MORE signs. If a
 * larger tier's minimum works out cheaper, the order is priced at that tier —
 * the customer keeps the quantity they asked for and pays the better price.
 *
 * Nobody's price goes up. Five signs now cost $93.00 rather than $127.50,
 * which is the six-sign price, and the total never decreases as quantity
 * rises.
 *
 * Ties go to the customer's own quantity, so a run that is already on a tier
 * boundary reports itself plainly rather than claiming to be a deal.
 */
export function getYardSignPrice(
  sizeKey: string,
  quantity: number,
  doubleSided: boolean
): YardSignPrice | null {
  const size = signsPricingConfig.yardSigns.sizes[sizeKey];
  if (!size) return null;

  const own = getYardSignUnitPrice(sizeKey, quantity, doubleSided);
  if (own === null) return null;

  let best: YardSignPrice = {
    unitPrice: own,
    chargedQuantity: quantity,
    total: own * quantity,
  };

  // Only tiers ABOVE this quantity can undercut it: to get that rate you would
  // have to buy the tier's minimum, so that minimum is what it would cost.
  for (const tier of size.tiers) {
    if (tier.minQuantity <= quantity) continue;

    const unitPrice = doubleSided ? tier.double : tier.single;
    const total = unitPrice * tier.minQuantity;

    if (total < best.total) {
      best = { unitPrice, chargedQuantity: tier.minQuantity, total };
    }
  }

  return { ...best, total: Math.round(best.total * 100) / 100 };
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
  let pricedAtQuantity: number | undefined;

  if (input.method === "yard") {
    const sizeKey = input.sizeKey || "";
    const priced = getYardSignPrice(sizeKey, quantity, input.doubleSided);

    if (priced === null) {
      return empty(
        "This sign size is priced by hand — Gorilla Salem will confirm it."
      );
    }

    productTotal = priced.total;

    const sides = input.doubleSided ? "double-sided" : "single-sided";
    const bumped = priced.chargedQuantity > quantity;

    if (bumped) pricedAtQuantity = priced.chargedQuantity;

    lines.push({
      // Says what happened rather than showing a rate that does not divide
      // into the total. KEEP THIS SHORT: lib/email.ts renders every label in
      // a `white-space: nowrap` cell, and a long one squeezes the value to a
      // syllable per line on a phone. That is a defect this repo has already
      // shipped once, so the explanation lives in the summary card, where it
      // can wrap, and the label carries only the fact.
      label: bumped
        ? // Shorter than the ordinary line on purpose, not longer: "sides" is
          // already its own row above, and the label column is the one that
          // must not grow.
          `${quantity} × ${sizeKey}, ${priced.chargedQuantity}-sign price`
        : `${quantity} × ${sizeKey} ${sides} @ $${priced.unitPrice.toFixed(2)}`,
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

    // Perimeter of ONE piece, in feet. Used by the sewn double-sided
    // construction charge and by the no-hem credit.
    const perimeterFt =
      (((input.widthInches || 0) + (input.heightInches || 0)) * 2) / 12;

    // Banners carry their own double-sided rules per material; every other
    // sqft method uses the flat surcharge.
    const bannerDouble =
      input.method === "banner"
        ? cfg.banner.doubleSided[input.material || ""]
        : undefined;

    const canDoubleSide =
      input.method !== "banner" || Boolean(bannerDouble);

    const wantsDouble =
      input.doubleSided &&
      canDoubleSide &&
      (cfg.doubleSidedMethods as readonly string[]).includes(input.method);

    // 13 oz shows through, so double-sided means two panels sewn back to back
    // rather than a per-sqft surcharge.
    const isSewnDouble = wantsDouble && bannerDouble?.method === "sewn";
    const takesDoubleSurcharge = wantsDouble && !isSewnDouble;

    const effectivePerSqft = takesDoubleSurcharge
      ? perSqft + cfg.doubleSidedPerSqft
      : perSqft;

    const totalSqft = sqftEach * quantity;
    // Sewn double-sided is literally two banners, so the material doubles.
    const panels = isSewnDouble ? 2 : 1;
    productTotal = effectivePerSqft * totalSqft * panels;

    lines.push({
      label: isSewnDouble
        ? `${quantity} × ${sqftEach.toFixed(2)} sqft @ $${effectivePerSqft.toFixed(
            2
          )}/sqft × 2 panels (sewn back to back)`
        : `${quantity} × ${sqftEach.toFixed(2)} sqft @ $${effectivePerSqft.toFixed(
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

    if (isSewnDouble) {
      const rate = bannerDouble?.constructionPerLinearFoot || 0;
      const construction = rate * perimeterFt * quantity;

      if (construction > 0) {
        productTotal += construction;
        lines.push({
          label: `Sewn back-to-back construction (${perimeterFt.toFixed(
            0
          )} lin ft each @ $${rate})`,
          amount: round2(construction),
        });
      }
    }

    // The sqft rate includes hems, so skipping them credits the labour back:
    // $2 per linear foot of edge, i.e. the perimeter, per banner.
    if (
      input.method === "banner" &&
      input.finishing === cfg.banner.noHemFinishingLabel &&
      // 18 oz only — 13 oz and mesh always get hemmed, so they never earn
      // the credit even if a stale finishing value reaches this far.
      cfg.banner.noHemMaterials.includes(input.material || "")
    ) {
      // Clamped so a pathological custom size can never credit past the
      // product cost and produce a negative banner.
      const credit = Math.min(
        productTotal,
        cfg.banner.noHemCreditPerLinearFoot * perimeterFt * quantity
      );

      if (credit > 0) {
        productTotal -= credit;
        lines.push({
          label: `No hem credit (${perimeterFt.toFixed(0)} lin ft each @ $${
            cfg.banner.noHemCreditPerLinearFoot
          })`,
          amount: -round2(credit),
        });
      }
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

      // Reinforcement is a 13 oz double-sided option. Checking it here as well
      // as in the UI is what stops a stale key in the quote payload billing for
      // work that was never offered.
      if (
        key === REINFORCEMENT_ADD_ON_KEY &&
        !allowsReinforcement(input.material || "", Boolean(input.doubleSided))
      ) {
        continue;
      }

      if (addOn.quoteByHand) {
        hasQuotedExtras = true;
        lines.push({ label: `${addOn.label} — quoted separately`, amount: 0 });
        continue;
      }

      // Webbing/D-rings/rope is sewn AROUND THE EDGE, so it prices by the
      // linear foot of perimeter rather than as a flat fee. A 24" x 96" banner
      // is 2 x (24 + 96) = 240" = 20 linear ft, which at $6 comes to $120.
      const perFoot = "perLinearFoot" in addOn ? addOn.perLinearFoot : 0;

      if (perFoot > 0) {
        const perimeterFeet =
          (2 * ((input.widthInches || 0) + (input.heightInches || 0))) / 12;
        const each = perimeterFeet * perFoot;
        const amount = each * quantity;

        productTotal += amount;
        lines.push({
          label: `${addOn.label} (${round2(perimeterFeet)} linear ft × $${perFoot}${
            quantity > 1 ? ` × ${quantity}` : ""
          })`,
          amount: round2(amount),
        });
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
  // One design per signs quote, so this is charged once — see the note on
  // setupFee. There is no longer a second, size-dependent fee: a custom size
  // costs the same as a standard one on every sign type.
  lines.push({ label: "Setup fee (per design)", amount: cfg.setupFee });
  const total = productTotal + cfg.setupFee;

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
    pricedAtQuantity,
  };
}
