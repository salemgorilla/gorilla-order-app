/**
 * npm run audit:anchors
 *
 * Prints the pricing rules and anchor totals a production health check needs,
 * derived from the code, so nothing has to carry a COPY of them.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * PRODUCTION-HEALTH-CHECK-HANDOFF.md was made self-contained so it could be
 * pasted into an agent's context. That was right for the agent and it created
 * a copy of the rates, and the scheduled health check
 * (trig_01CDHJYQF4Ypdoq7eXP6UQLA) then copied them AGAIN into its own stored
 * prompt. Its own description says a change to the file "won't automatically
 * update the scheduled task's own copy of the formulas/anchors… ping whoever
 * owns this scheduled task to refresh it".
 *
 * tests/health-check-handoff-current.test.ts makes the doc's copy fail loudly
 * when it drifts. It cannot reach the trigger, and no test can.
 *
 * This removes the need to. A run that executes this command instead of
 * reading baked-in figures is correct the moment a rate changes, with nobody
 * pinged and nothing refreshed. `npm run audit:anchors` is the answer to
 * "how do we automate this for the future".
 *
 * ── IT IS DERIVED, NOT TRANSCRIBED ────────────────────────────────────────
 * Every number below comes from calling lib/pricing.ts and lib/tax.ts. There
 * are no literals here except the SPECS of the anchor orders — what to order,
 * not what it costs. If a rate moves, this output moves with it, which is the
 * whole point and the one property that must never be quietly lost.
 *
 * Read-only. No network, no credentials, no Printavo.
 */
import {
  STICKER_ORDER_MINIMUM,
  STICKER_SETUP_FEE,
  STICKER_SETUP_FEE_ADDITIONAL,
  STICKER_VOLUME_TIERS,
  getStickerMaterialPrice,
  getStickerUnitMaterialPrice,
  quoteStickerCart,
} from "../lib/pricing";
import { SALES_TAX, getStickerTotals } from "../lib/tax";

type Design = {
  quantity: number;
  size: number;
  material: string;
  shape: string;
};

const ANCHORS: Array<{ label: string; designs: Design[] }> = [
  {
    label: '100 x 3" Gloss White Vinyl, die cut',
    designs: [{ quantity: 100, size: 3, material: "Gloss White Vinyl", shape: "Die Cut" }],
  },
  {
    label: '100 x 3" Matte White Vinyl, circle',
    designs: [{ quantity: 100, size: 3, material: "Matte White Vinyl", shape: "Circle" }],
  },
  {
    label: '25 x 2" Gloss, die cut (hits the order minimum)',
    designs: [{ quantity: 25, size: 2, material: "Gloss White Vinyl", shape: "Die Cut" }],
  },
  {
    label: '150 x 4" + 50 x 2" Gloss, die cut (two designs)',
    designs: [
      { quantity: 150, size: 4, material: "Gloss White Vinyl", shape: "Die Cut" },
      { quantity: 50, size: 2, material: "Gloss White Vinyl", shape: "Die Cut" },
    ],
  },
];

function materialPrice(design: Design): number {
  return getStickerMaterialPrice(
    design.quantity,
    design.material,
    `${design.size}"`,
    { widthInches: design.size, heightInches: design.size },
    design.shape
  );
}

function unitPrice(design: Design): number {
  return getStickerUnitMaterialPrice(
    design.quantity,
    design.material,
    `${design.size}"`,
    { widthInches: design.size, heightInches: design.size },
    design.shape
  );
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function main() {
  const asJson = process.argv.slice(2).includes("--json");
  const rows = ANCHORS.map((anchor) => {
    const cart = quoteStickerCart({
      materialPrices: anchor.designs.map(materialPrice),
      deliveryMethod: "Pickup",
    }) as unknown as {
      stickerPrice: number;
      setupPrice: number;
      minimumPrice?: number;
      total: number;
    };

    const taxed = getStickerTotals({
      stickerPrice: cart.stickerPrice,
      setupPrice: cart.setupPrice,
      total: cart.total,
    });

    return {
      label: anchor.label,
      designs: anchor.designs.map((design) => ({
        ...design,
        unitPrice: Number(unitPrice(design).toFixed(4)),
        linePrice: materialPrice(design),
      })),
      goods: cart.stickerPrice,
      setup: cart.setupPrice,
      minimum: Number(cart.minimumPrice) || 0,
      preTax: cart.total,
      estimatedTax: taxed.estimatedTax,
      withTax: taxed.estimatedTotal,
    };
  });

  const derived = {
    generatedFrom: "lib/pricing.ts + lib/tax.ts",
    setupFirstDesign: STICKER_SETUP_FEE,
    setupAdditionalDesign: STICKER_SETUP_FEE_ADDITIONAL,
    orderMinimum: STICKER_ORDER_MINIMUM,
    salesTaxPercent: SALES_TAX.ratePercent,
    salesTaxJurisdiction: SALES_TAX.jurisdiction,
    taxAppliesTo: "goods only — never setup, minimum, rush or add-ons",
    volumeTiers: STICKER_VOLUME_TIERS,
    anchors: rows,
  };

  if (asJson) {
    console.log(JSON.stringify(derived, null, 2));
    return;
  }

  console.log("HEALTH CHECK ANCHORS — derived from the code, not transcribed");
  console.log("============================================================");
  console.log("");
  console.log("Use THIS output. Do not use a table copied into a prompt: a copy");
  console.log("is correct only until the next re-rate, and this repo re-rated");
  console.log("stickers four times in two days in September.");
  console.log("");
  console.log(`  setup            ${money(STICKER_SETUP_FEE)} first design, ` +
    `${money(STICKER_SETUP_FEE_ADDITIONAL)} each additional`);
  console.log(`  order minimum    ${money(STICKER_ORDER_MINIMUM)} of goods + setup, as its own line`);
  console.log(`  sales tax        ${SALES_TAX.ratePercent}% (${SALES_TAX.jurisdiction}) on GOODS ONLY`);
  console.log("                   never on setup, minimum, rush or add-ons");
  console.log("");
  console.log("  volume tiers (interpolated between, flat past the last):");
  console.log("    qty      piece   area");
  for (const tier of STICKER_VOLUME_TIERS) {
    console.log(
      `    ${String(tier.at).padStart(5)}    ${tier.piece.toFixed(2)}    ${tier.area.toFixed(2)}`
    );
  }
  console.log("");
  console.log("ANCHOR ORDERS (Local Pickup, no discount code)");
  console.log("");

  for (const row of rows) {
    console.log(`  ${row.label}`);
    for (const design of row.designs) {
      console.log(
        `    ${design.quantity} x ${design.size}" ${design.material} ${design.shape}` +
          ` — unit ${money(design.unitPrice)} (4dp ${design.unitPrice}), line ${money(design.linePrice)}`
      );
    }
    console.log(
      `    goods ${money(row.goods)}   setup ${money(row.setup)}` +
        (row.minimum > 0 ? `   minimum ${money(row.minimum)}` : "") +
        `   pre-tax ${money(row.preTax)}`
    );
    console.log(`    tax ${money(row.estimatedTax)}   >>> WITH TAX ${money(row.withTax)}`);
    console.log("");
  }

  console.log("The line is round(round(unit, 4dp) x quantity, 4dp) — Printavo");
  console.log("stores a unit price to four decimals and multiplies, so the app");
  console.log("quotes the figure Printavo will reach rather than one its invoice");
  console.log("then contradicts.");
  console.log("");
  console.log("NOT COVERED HERE, and still on the run to compute: shipping,");
  console.log("discount codes, signs and banners, apparel.");
}

main();
