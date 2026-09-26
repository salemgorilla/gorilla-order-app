import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  STICKER_ORDER_MINIMUM,
  STICKER_SETUP_FEE,
  STICKER_SETUP_FEE_ADDITIONAL,
  STICKER_VOLUME_TIERS,
  getStickerMaterialPrice,
  quoteStickerCart,
} from "../lib/pricing";
import { SALES_TAX, getStickerTotals } from "../lib/tax";

/**
 * THE HANDOFF QUOTES THE PRICING RULES, SO THE PRICING RULES GUARD IT.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `PRODUCTION-HEALTH-CHECK-HANDOFF.md` was made SELF-CONTAINED on 2026-09-26
 * so it could be pasted straight into an agent's context. That was the right
 * call for the agent and it created a copy: the rates, the volume tiers, the
 * multipliers and four anchor totals are now written out in prose, away from
 * the code that computes them.
 *
 * Worse, the copy propagated. The scheduled health check
 * (trig_01CDHJYQF4Ypdoq7eXP6UQLA) baked those same figures into its own
 * stored prompt, and its description says in as many words that a change to
 * the file "won't automatically update the scheduled task's own copy of the
 * formulas/anchors… ping whoever owns this scheduled task to refresh it".
 *
 * That is a memory exercise, and memory exercises are what failed all week:
 * the Reconciled table drifted thirty commits, the "Live right now" heading
 * went a month stale, and a verification skill claimed a script did not
 * exist. This repo re-rated stickers FOUR TIMES IN TWO DAYS in September.
 *
 * So the reminder is a test. Move a rate and this fails, names the file, and
 * says the scheduled task needs refreshing too — instead of a production
 * health check quietly validating yesterday's prices against today's app and
 * reporting a mismatch that is really its own staleness.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 * It cannot reach into the scheduled task and update it; nothing here can.
 * It can only make the need impossible to miss at the moment the rate moves,
 * which is the last moment anyone is thinking about it.
 */

const DOC_PATH = new URL("../PRODUCTION-HEALTH-CHECK-HANDOFF.md", import.meta.url);
const doc = readFileSync(DOC_PATH, "utf8");
const pricingSource = readFileSync(new URL("../lib/pricing.ts", import.meta.url), "utf8");

const STALE = (what: string) =>
  `${what} in PRODUCTION-HEALTH-CHECK-HANDOFF.md no longer matches the code.\n` +
  `  1. Update that file.\n` +
  `  2. The scheduled health check (trig_01CDHJYQF4Ypdoq7eXP6UQLA) baked the\n` +
  `     same figures into its own prompt and will NOT pick this up — its owner\n` +
  `     has to refresh it, or the next run will report its own staleness as a\n` +
  `     production mismatch.`;

/** `const NAME = 0.34;` out of lib/pricing.ts, for the unexported rates. */
function sourceConstant(name: string): string {
  const match = pricingSource.match(new RegExp(`^const ${name} = ([\\d.]+);`, "m"));
  assert.ok(match, `${name} is no longer a top-level const in lib/pricing.ts`);
  return match[1];
}

function priceOf(design: {
  quantity: number;
  size: number;
  material: string;
  shape: string;
}) {
  return getStickerMaterialPrice(
    design.quantity,
    design.material,
    `${design.size}"`,
    { widthInches: design.size, heightInches: design.size },
    design.shape
  );
}

/** The four anchor rows, as SPECS. The doc owns the prose; this owns the maths. */
const ANCHORS = [
  {
    label: '100 × 3" Gloss White Vinyl, die cut',
    designs: [{ quantity: 100, size: 3, material: "Gloss White Vinyl", shape: "Die Cut" }],
  },
  {
    label: '100 × 3" Matte White Vinyl, circle',
    designs: [{ quantity: 100, size: 3, material: "Matte White Vinyl", shape: "Circle" }],
  },
  {
    label: '25 × 2" Gloss, die cut',
    designs: [{ quantity: 25, size: 2, material: "Gloss White Vinyl", shape: "Die Cut" }],
  },
  {
    label: '150 × 4" + 50 × 2" Gloss (2 designs)',
    designs: [
      { quantity: 150, size: 4, material: "Gloss White Vinyl", shape: "Die Cut" },
      { quantity: 50, size: 2, material: "Gloss White Vinyl", shape: "Die Cut" },
    ],
  },
];

describe("the handoff's anchor totals are what the app actually computes", () => {
  for (const anchor of ANCHORS) {
    test(anchor.label, () => {
      const cart = quoteStickerCart({
        materialPrices: anchor.designs.map(priceOf),
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

      // The row, rebuilt from the code exactly as the doc formats it. A
      // mismatch anywhere in it fails, including a figure quietly edited by
      // hand to make a previous failure go away.
      const row =
        `| ${anchor.label} | $${cart.stickerPrice.toFixed(2)} | ` +
        `$${cart.setupPrice.toFixed(2)} | ` +
        `${Number(cart.minimumPrice) > 0 ? `**$${Number(cart.minimumPrice).toFixed(2)}**` : "—"} | ` +
        `$${cart.total.toFixed(2)} | **$${taxed.estimatedTotal.toFixed(2)}** |`;

      assert.ok(
        doc.includes(row),
        `${STALE(`The anchor row for ${anchor.label}`)}\n\n  expected this row:\n  ${row}`
      );
    });
  }
});

describe("the handoff's quoted rules are the real ones", () => {
  test("the per-piece and per-square-inch rates", () => {
    const perPiece = sourceConstant("STICKER_PER_PIECE");
    const perSqIn = sourceConstant("MATERIAL_RATE_PER_SQ_IN");

    assert.ok(
      doc.includes(`$${perPiece}/piece`),
      STALE(`The per-piece rate ($${perPiece})`)
    );
    assert.ok(
      doc.includes(`areaSqIn × $${perSqIn}`),
      STALE(`The per-square-inch rate ($${perSqIn})`)
    );
  });

  test("setup, the order minimum and the tax rate", () => {
    assert.ok(
      doc.includes(`$${STICKER_SETUP_FEE} first design + $${STICKER_SETUP_FEE_ADDITIONAL.toFixed(2)} each additional`),
      STALE(`Setup ($${STICKER_SETUP_FEE} + $${STICKER_SETUP_FEE_ADDITIONAL.toFixed(2)})`)
    );
    assert.ok(
      doc.includes(`up to $${STICKER_ORDER_MINIMUM} of goods`),
      STALE(`The order minimum ($${STICKER_ORDER_MINIMUM})`)
    );
    assert.ok(
      doc.includes(`${SALES_TAX.ratePercent}% on goods only`),
      STALE(`The tax rate (${SALES_TAX.ratePercent}%)`)
    );
    assert.ok(
      doc.includes(`**${SALES_TAX.ratePercent}%**`) || doc.includes(`${SALES_TAX.ratePercent}%`),
      STALE(`The tax rate (${SALES_TAX.ratePercent}%)`)
    );
  });

  test("every volume tier, both keep factors", () => {
    // The table that governs every quantity above 100. A tier edited in code
    // and not in the doc sends the health check hunting a phantom mismatch
    // on exactly the orders it was told to place (25-150 per design).
    for (const tier of STICKER_VOLUME_TIERS) {
      const row = `| ${tier.at} | ${tier.piece.toFixed(2)} | ${tier.area.toFixed(2)} |`;
      assert.ok(doc.includes(row), `${STALE(`The volume tier at ${tier.at}`)}\n\n  expected: ${row}`);
    }

    // And no EXTRA rows: a tier deleted from code but left in the doc is the
    // same defect pointing the other way.
    const documented = [...doc.matchAll(/^\| (\d+) \| \d\.\d\d \| \d\.\d\d \|$/gm)].map((m) =>
      Number(m[1])
    );
    assert.deepEqual(
      documented,
      STICKER_VOLUME_TIERS.map((tier) => tier.at),
      STALE("The set of volume tiers")
    );
  });

  test("the shape and material multipliers", () => {
    // Not exported, so read from source — the point is that the two texts
    // agree, and a multiplier is exactly the kind of figure that moves.
    const documented: Array<[string, RegExp]> = [
      ["die cut", /"Die Cut": ([\d.]+),/],
      ["oval", /Oval: ([\d.]+),/],
      ["chrome", /Chrome: ([\d.]+),/],
      ["holographic", /Holographic: ([\d.]+),/],
      ["clear vinyl", /"Clear Vinyl": ([\d.]+),/],
    ];

    for (const [name, pattern] of documented) {
      const match = pricingSource.match(pattern);
      assert.ok(match, `${name} is no longer in lib/pricing.ts under that key`);
      assert.ok(
        doc.includes(`${name} ×${match[1]}`),
        STALE(`The ${name} multiplier (×${match[1]})`)
      );
    }

    const matte = sourceConstant("MATTE_MULTIPLIER");
    assert.ok(doc.includes(`matte ×${matte}`), STALE(`The matte multiplier (×${matte})`));
  });
});

describe("the handoff still says the things that are not arithmetic", () => {
  test("the deposit ceiling and the apparel rule survive an edit", () => {
    // These are not derived, so nothing else would catch their deletion —
    // and they are the two sentences that decide whether a run escalates.
    assert.match(doc, /\$4,999\.99/, "the deposit ceiling is no longer stated");
    assert.match(
      doc,
      /must never get a payment link|never acquire a payment link/i,
      "the apparel rule is no longer stated"
    );
    assert.match(doc, /trig_01CDHJYQF4Ypdoq7eXP6UQLA|fresh `submissionKey`/, "");
  });
});
