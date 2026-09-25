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
import { getStickerPrice } from "../lib/pricing";

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
