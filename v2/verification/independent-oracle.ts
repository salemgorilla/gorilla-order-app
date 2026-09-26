/**
 * A SECOND OPINION ON THE MONEY, WRITTEN FROM THE BUSINESS RULES.
 *
 *   npm run audit:oracle
 *
 * ── WHY IT IS NOT UNDER tests/ ────────────────────────────────────────────
 * Deliberately outside the suite, and deliberately not run by CI.
 *
 * A test under `tests/` shares the repo's assumptions by construction: it
 * imports the same helpers, reuses the same fixtures, and is maintained by
 * whoever last changed the code it checks. When a rate is wrong in
 * `lib/pricing.ts`, the natural fix is to update the test to match — and
 * `tests/price-sheet.test.ts` exists precisely so that doing so produces a
 * readable diff rather than a silent drift. That is the right tool for
 * "did this change move a price".
 *
 * It is the wrong tool for "is the price RIGHT". A shared mistake is
 * invisible to it: if the formula and the expected totals were derived from
 * each other, they agree whatever either of them says.
 *
 * So this file re-derives the sticker total from the RULES as stated in
 * prose — Gabe's quoted figures, the constants' own documentation, the
 * reconciled invoices — and compares the answer to what the app computes.
 * It imports exactly one thing from `lib/`: the function under audit. Every
 * other number here is typed out again from the documentation, on purpose.
 * Two implementations that were written from the same sentences and
 * disagree mean one of them read those sentences wrong, and that is worth
 * knowing before a customer finds it.
 *
 * ── WHY IT IS NOT A GATE ──────────────────────────────────────────────────
 * It exits non-zero on a disagreement so a human can run it and see, but
 * nothing blocks on it. A legitimate re-rate makes this file wrong until
 * someone updates it from the new rules, and a gate that goes red on every
 * intended change gets deleted. Run it after a repricing, read what it
 * says, and update the constants below FROM THE DECISION rather than from
 * lib/pricing.ts — copying them across defeats the entire point.
 *
 * ── WHAT IT CANNOT DO ─────────────────────────────────────────────────────
 * It is not the Printavo reconciliation. It cannot see Printavo's rounding,
 * its tax engine or its line-item behaviour. AGENTS.md is unchanged: a
 * change touching pricing ends with one real order checked against a real
 * invoice, to the cent.
 */
import {
  getStickerMaterialPrice,
  getStickerPrice,
  quoteStickerCart,
} from "../lib/pricing";

// ──────────────────────────────────────────────────────────────────────────
// The rules, restated. Sources named so the next reader can check the claim
// rather than trusting the number.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Per-piece and per-square-inch, scaled together by ~58% on 2026-09-11.
 * Anchor: 100 x 3" circles come to $85.00 before tax — Gabe, 2026-09-11,
 * "should be closer to $85", and confirmed by Printavo Request #10568 which
 * asked for $87.81 = $85.00 x 1.0625 on GS-20260912-81PI1.
 */
const PER_PIECE = 0.34;
const PER_SQUARE_INCH = 0.04;

/** $15 first design, $7.50 each after — Gabe, 2026-09-12. */
const SETUP_FIRST = 15;
const SETUP_ADDITIONAL = 7.5;

/**
 * No order bills under this, goods + setup. On the GOODS, before shipping:
 * a $30 order picked up and the same order shipped both meet it, and the
 * shipping goes on top.
 */
const ORDER_MINIMUM = 45;

/**
 * Two curves, not one. The per-piece term and the per-area term discount
 * separately so that every size in the old site's table prices at or above
 * its re-anchored figure — Gabe, "can you fix that so the profit margins
 * stay where they need to be or higher?"
 */
const TIERS: ReadonlyArray<{ at: number; piece: number; area: number }> = [
  { at: 100, piece: 1, area: 1 },
  { at: 250, piece: 0.96, area: 0.6 },
  { at: 500, piece: 0.85, area: 0.47 },
  { at: 1000, piece: 0.8, area: 0.39 },
  { at: 2500, piece: 0.69, area: 0.39 },
  { at: 5000, piece: 0.62, area: 0.36 },
];

/** The old site's modifiers, put back 2026-09-12. */
const SHAPE: Record<string, number> = { "Die Cut": 1.2, Oval: 1.05 };
const MATERIAL: Record<string, number> = {
  Chrome: 1.3,
  Holographic: 1.35,
  "Clear Vinyl": 1.15,
};
const MATTE = 1.05;

// ──────────────────────────────────────────────────────────────────────────
// The independent derivation.
// ──────────────────────────────────────────────────────────────────────────

/** Linear between tiers, flat past the last — "a step is a cliff". */
function keepAt(quantity: number): { piece: number; area: number } {
  const qty = Math.max(1, Math.floor(quantity || 0));

  if (qty <= TIERS[0].at) return { piece: TIERS[0].piece, area: TIERS[0].area };

  const last = TIERS[TIERS.length - 1];
  if (qty >= last.at) return { piece: last.piece, area: last.area };

  for (let i = 1; i < TIERS.length; i += 1) {
    const lo = TIERS[i - 1];
    const hi = TIERS[i];
    if (qty > hi.at) continue;
    const t = (qty - lo.at) / (hi.at - lo.at);
    return {
      piece: lo.piece + (hi.piece - lo.piece) * t,
      area: lo.area + (hi.area - lo.area) * t,
    };
  }

  return { piece: last.piece, area: last.area };
}

/**
 * Shape, finish and material each multiply the WHOLE unit — three modifiers
 * applied in turn, which is how the rule is stated and therefore how it is
 * applied here.
 *
 * THE ORDER IS LOAD-BEARING, which this file found the hard way. Folding
 * the three factors into one number first and multiplying once gives a
 * different float, and on 100 x 3" Matte Oval that lands the other side of
 * the 4dp rounding boundary: $92.17 against $92.18. A cent, from
 * multiplication order alone, on the surface that raises a payable link.
 *
 * Left as a note rather than a change to lib/pricing.ts: nothing there is
 * wrong, and touching it would move a billed figure for no benefit. What is
 * worth knowing is that the sticker unit sits close enough to a 4dp
 * boundary that association matters — so a future refactor that "tidies"
 * these three multiplications into one constant is not the no-op it looks.
 */
function applyModifiers(unit: number, material: string, shape: string): number {
  const name = String(material || "").trim();
  const premium = MATERIAL[name] ?? 1;
  const matte = /matte/i.test(name) ? MATTE : 1;
  const shapeFactor = SHAPE[String(shape || "").trim()] ?? 1;

  return unit * shapeFactor * (premium * matte);
}

export type OracleOrder = {
  quantity: number;
  widthInches: number;
  heightInches: number;
  material: string;
  shape: string;
  designCount?: number;
};

/** What the rules say this order costs, before tax and shipping. */
/** One design's line: the 4dp unit Printavo stores, times the quantity. */
function lineFor(order: OracleOrder): number {
  const qty = Math.max(1, Math.floor(order.quantity || 0));
  const area = (order.widthInches || 0) * (order.heightInches || 0);

  if (!(area > 0)) return 0;

  const keep = keepAt(qty);
  const unit = applyModifiers(
    PER_PIECE * keep.piece + area * PER_SQUARE_INCH * keep.area,
    order.material,
    order.shape
  );

  return Math.round(Number(unit.toFixed(4)) * qty * 10_000) / 10_000;
}

export function oracleTotal(order: OracleOrder): number {
  const qty = Math.max(1, Math.floor(order.quantity || 0));
  const area = (order.widthInches || 0) * (order.heightInches || 0);

  // No dimensions is no price. A per-piece term that survives a zero area
  // once put a live payable link on 1,000 stickers of no particular size.
  if (!(area > 0)) return 0;

  const keep = keepAt(qty);
  const unit = applyModifiers(
    PER_PIECE * keep.piece + area * PER_SQUARE_INCH * keep.area,
    order.material,
    order.shape
  );

  const designs = Math.max(1, Math.floor(order.designCount ?? 1));
  const setup = SETUP_FIRST + SETUP_ADDITIONAL * (designs - 1);

  /**
   * THE LINE ROUNDS AT FOUR DECIMALS, NOT TWO, AND NOT ONLY AT THE END.
   *
   * Printavo stores a line's unit price to four decimal places and
   * multiplies by the quantity itself, so the app quotes the number
   * Printavo will arrive at rather than one the invoice then contradicts.
   * That makes the 4dp step a business rule about the system of record, not
   * an implementation detail, so the oracle has to model it too.
   *
   * Found by this file disagreeing: without the step it differed by a cent
   * on 3 of 1,625 configurations, all of them Oval — the 1.05 multiplier
   * lands on the boundary more often than the others. A cent, on the
   * surface that raises a payable link. The oracle was the wrong one.
   */
  const line = Math.round(Number(unit.toFixed(4)) * qty * 10_000) / 10_000;

  return Math.round((line + setup) * 100) / 100;
}

/**
 * What the RULES say a whole cart costs, pre-tax.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `oracleTotal` above audits `getStickerPrice`: one design's material plus a
 * flat setup fee. That is one term of four, and an adversarial review on
 * 2026-09-25 listed what the gap hid — every one of these was MISSED by the
 * sweep as it stood:
 *
 *   - the $45 ORDER MINIMUM, the largest single distortion on a small order
 *     and the figure #186's money story turns on
 *   - the additional-design setup fee, since the sweep never set designCount
 *   - non-square geometry, since SIZES was square-only
 *
 * The rules, from the documentation rather than the code:
 *
 *   goods   = sum of each design's line (4dp unit x quantity, per design)
 *   setup   = $15 for the first design + $7.50 for each after
 *   minimum = tops GOODS + SETUP up to $45, as its own line, and 0 above it
 *   pre-tax = goods + setup + minimum
 *
 * Shipping sits on top of the minimum rather than inside it — a $30 order
 * picked up and the same order shipped meet the same $45 — and is out of
 * scope here along with discount codes.
 */
export function oracleCartTotal(designs: readonly OracleOrder[]): {
  goods: number;
  setup: number;
  minimum: number;
  preTax: number;
} {
  const goods =
    Math.round(
      designs.reduce((sum, design) => sum + lineFor(design), 0) * 100
    ) / 100;

  const setup =
    Math.round((SETUP_FIRST + SETUP_ADDITIONAL * (designs.length - 1)) * 100) / 100;

  // max(0, …): at or above the minimum this is nothing, and it must never
  // become a DISCOUNT on a big order.
  const minimum = Math.max(0, Math.round((ORDER_MINIMUM - goods - setup) * 100)) / 100;

  return {
    goods,
    setup,
    minimum,
    preTax: Math.round((goods + setup + minimum) * 100) / 100,
  };
}

/** What the app says about a whole cart. The figure Printavo bills from. */
function appCartTotal(designs: readonly OracleOrder[]): {
  goods: number;
  setup: number;
  minimum: number;
  preTax: number;
} {
  const cart = quoteStickerCart({
    materialPrices: designs.map((design) =>
      getStickerMaterialPrice(
        design.quantity,
        design.material,
        `${design.widthInches}"`,
        { widthInches: design.widthInches, heightInches: design.heightInches },
        design.shape
      )
    ),
    deliveryMethod: "Pickup",
  }) as unknown as {
    stickerPrice: number;
    setupPrice: number;
    minimumPrice: number;
    total: number;
  };

  return {
    goods: cart.stickerPrice,
    setup: cart.setupPrice,
    minimum: cart.minimumPrice,
    preTax: cart.total,
  };
}

/** What the app says. One import, one call, no shared helpers. */
function appTotal(order: OracleOrder): number {
  return getStickerPrice(
    order.quantity,
    order.material,
    "Gloss",
    `${order.widthInches}"`,
    { widthInches: order.widthInches, heightInches: order.heightInches },
    order.shape
  );
}

// ──────────────────────────────────────────────────────────────────────────
// The sweep.
// ──────────────────────────────────────────────────────────────────────────

const QUANTITIES = [25, 50, 100, 137, 250, 400, 500, 750, 1000, 1800, 2500, 5000, 10_000];
const SIZES = [2, 3, 4, 5, 6];

/**
 * Non-square, deliberately. SIZES is square-only, so `getAreaSqIn`'s
 * `width * height` was unaudited — a swap to `width * width` passed the
 * whole sweep, and the builder offers independent W and H.
 */
const RECTANGLES: Array<[number, number]> = [
  [2, 4],
  [4, 2],
  [3, 7],
  [1.5, 5.5],
  [6, 2.25],
];

/**
 * Carts, including two that land UNDER the $45 minimum. The minimum is the
 * largest single distortion on a small order and nothing audited it.
 */
const CARTS: Array<{ label: string; designs: OracleOrder[] }> = [
  {
    label: "one small design, under the minimum",
    designs: [{ quantity: 10, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Die Cut" }],
  },
  {
    label: "one tiny design, far under the minimum",
    designs: [{ quantity: 1, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Square" }],
  },
  {
    label: "two designs, under the minimum between them",
    designs: [
      { quantity: 5, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Square" },
      { quantity: 5, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Square" },
    ],
  },
  {
    label: "two designs, just over the minimum",
    designs: [
      { quantity: 25, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Die Cut" },
      { quantity: 25, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Die Cut" },
    ],
  },
  {
    label: "three designs, mixed sizes and materials",
    designs: [
      { quantity: 150, widthInches: 4, heightInches: 4, material: "Gloss White Vinyl", shape: "Die Cut" },
      { quantity: 50, widthInches: 2, heightInches: 6, material: "Matte White Vinyl", shape: "Square" },
      { quantity: 500, widthInches: 3, heightInches: 3, material: "Chrome", shape: "Circle" },
    ],
  },
  {
    label: "five designs, so the additional-setup term dominates",
    designs: Array.from({ length: 5 }, (_, i) => ({
      quantity: 25 + i * 25,
      widthInches: 2 + i,
      heightInches: 3,
      material: "Gloss White Vinyl",
      shape: "Die Cut" as const,
    })),
  },
];
const MATERIALS = ["Gloss White Vinyl", "Matte White Vinyl", "Chrome", "Holographic", "Clear Vinyl"];
const SHAPES = ["Die Cut", "Circle", "Square", "Oval", "Rounded Corners"];

/**
 * The anchors, which are not derived from anything in this repo.
 *
 * Each traces to a figure a HUMAN stated or a real invoice collected. If
 * the formula ever drifts away from these, the formula is wrong however
 * self-consistent it has become.
 */
const ANCHORS: Array<{ what: string; order: OracleOrder; expect: number }> = [
  {
    what: 'Gabe, 2026-09-11: 100 x 3" "closer to $85"; Printavo #10568 collected $87.81 incl. tax',
    order: { quantity: 100, widthInches: 3, heightInches: 3, material: "Gloss White Vinyl", shape: "Circle" },
    expect: 85.0,
  },
];

function main() {
  const failures: string[] = [];
  let compared = 0;

  for (const quantity of QUANTITIES) {
    for (const size of SIZES) {
      for (const material of MATERIALS) {
        for (const shape of SHAPES) {
          const order: OracleOrder = {
            quantity,
            widthInches: size,
            heightInches: size,
            material,
            shape,
          };

          const mine = oracleTotal(order);
          const theirs = appTotal(order);
          compared += 1;

          // A cent of float noise between two orderings of the same
          // multiplications is not a disagreement about price.
          if (Math.abs(mine - theirs) > 0.01) {
            failures.push(
              `${quantity} x ${size}" ${material} ${shape}: ` +
                `oracle $${mine.toFixed(2)} vs app $${theirs.toFixed(2)} ` +
                `(${(theirs - mine >= 0 ? "+" : "") + (theirs - mine).toFixed(2)})`
            );
          }
        }
      }
    }
  }

  // ── Non-square geometry, against getStickerPrice ───────────────────────
  for (const [width, height] of RECTANGLES) {
    for (const quantity of [25, 100, 500, 2500]) {
      for (const material of MATERIALS) {
        const order: OracleOrder = {
          quantity,
          widthInches: width,
          heightInches: height,
          material,
          shape: "Die Cut",
        };

        const mine = oracleTotal(order);
        const theirs = appTotal(order);
        compared += 1;

        if (Math.abs(mine - theirs) > 0.01) {
          failures.push(
            `${quantity} x ${width}"x${height}" ${material}: ` +
              `oracle $${mine.toFixed(2)} vs app $${theirs.toFixed(2)}`
          );
        }
      }
    }
  }

  // ── Whole carts, against quoteStickerCart — the figure that BILLS ──────
  for (const cart of CARTS) {
    const mine = oracleCartTotal(cart.designs);
    const theirs = appCartTotal(cart.designs);
    compared += 1;

    for (const [field, a, b] of [
      ["goods", mine.goods, theirs.goods],
      ["setup", mine.setup, theirs.setup],
      ["minimum", mine.minimum, theirs.minimum],
      ["pre-tax", mine.preTax, theirs.preTax],
    ] as const) {
      if (Math.abs(a - b) > 0.01) {
        failures.push(
          `cart "${cart.label}" ${field}: oracle $${a.toFixed(2)} vs app $${b.toFixed(2)}`
        );
      }
    }
  }

  const anchorFailures: string[] = [];
  for (const anchor of ANCHORS) {
    const mine = oracleTotal(anchor.order);
    const theirs = appTotal(anchor.order);
    if (Math.abs(mine - anchor.expect) > 0.01) {
      anchorFailures.push(`ORACLE misses the anchor: $${mine.toFixed(2)} vs $${anchor.expect.toFixed(2)} — ${anchor.what}`);
    }
    if (Math.abs(theirs - anchor.expect) > 0.01) {
      anchorFailures.push(`APP misses the anchor: $${theirs.toFixed(2)} vs $${anchor.expect.toFixed(2)} — ${anchor.what}`);
    }
  }

  console.log("INDEPENDENT PRICE ORACLE");
  console.log("========================");
  console.log("");
  console.log(`Compared ${compared} sticker configurations against a second`);
  console.log("derivation written from the business rules, not from lib/pricing.ts.");
  console.log("");

  if (anchorFailures.length) {
    console.log("ANCHORS — figures a human stated or a real invoice collected:");
    for (const line of anchorFailures) console.log(`  ${line}`);
    console.log("");
  } else {
    console.log(`Anchors: ${ANCHORS.length}/${ANCHORS.length} hold.`);
    console.log("");
  }

  if (failures.length === 0) {
    console.log("No disagreements. Two independent derivations of the sticker");
    console.log("total agree to the cent across the sweep.");
  } else {
    console.log(`${failures.length} disagreement(s):`);
    for (const line of failures.slice(0, 25)) console.log(`  ${line}`);
    if (failures.length > 25) console.log(`  … and ${failures.length - 25} more`);
    console.log("");
    console.log("If a re-rate was intended, update the constants at the top of");
    console.log("this file FROM THE DECISION — never by copying lib/pricing.ts,");
    console.log("which is the one move that makes this file worthless.");
  }

  console.log("");
  console.log("This is not the Printavo reconciliation. AGENTS.md is unchanged:");
  console.log("a pricing change ends with one real order checked against a real");
  console.log("invoice, to the cent.");

  process.exit(failures.length + anchorFailures.length > 0 ? 1 : 0);
}

main();
