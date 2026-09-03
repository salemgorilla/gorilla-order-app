import {
  addBusinessDays,
  earliestNeedBy,
  formatNeedByDate,
  todayIso,
  turnaroundRules,
  type TurnaroundLane,
} from "./turnaround";

/**
 * Rush — the answer to "need it faster?" that is not a phone call.
 *
 * The turnaround floors (#97) end every too-soon message with "call or
 * email us". That sentence is where Kurt Sletten's job went: one shirt, a
 * firm Friday deadline, referred to another maker. The shop CAN sometimes
 * do it; the website just had no way to offer it, so the order left.
 *
 * ── WHY ONLY THE SLOW LANE, AND WHY THAT IS DELIBERATE ────────────────────
 * Rush is offered on apparel, yard signs and rigid signs — the hand-quoted
 * flows. It is NOT offered on stickers and banners, and that omission is
 * the safety property of this file, not an oversight:
 *
 *   1. The fast lane already promises the NEXT BUSINESS DAY at no charge,
 *      so the only thing left to sell there is same-day.
 *   2. Stickers AUTO-BILL. A same-day promise on that path would issue a
 *      live payment link for a deadline nobody at the shop has agreed to —
 *      the exact "no human in the loop" hazard AGENTS.md is built around.
 *      Selling same-day stickers needs the shop to confirm the date before
 *      money moves, and that is a change to who gets a payment link. It
 *      waits for the Printavo reconciliation the auto-bill path still owes
 *      (task #20), because the house rule is that a pricing change ends
 *      with a real invoice matched to the cent.
 *
 * Walk-ins already get same day at the counter (the walkin lane), where a
 * person agrees to it out loud. That is the same-day path today.
 *
 * THE SPEC IS DATA, like the turnaround day counts and the reference quote:
 * the window and the rate below are Gabe's numbers and this object is the
 * one place to change them.
 */
export const rushRules = {
  /**
   * Business days before which the shop will not promise even with a rush
   * fee. Standard slow-lane turnaround is 14; five is the floor the shop
   * can actually hit by rearranging the schedule.
   */
  minBusinessDays: 5,

  /**
   * Added to the goods on the quote — garments, printing and screens for
   * apparel; product and setup for signs. A share rather than a flat fee
   * because the cost of rearranging a schedule scales with the job.
   * Gabe's figure, 2026-09-03.
   */
  rate: 0.25,

  /** Which lanes may buy their way forward. See the note above. */
  lanes: ["slow"] as TurnaroundLane[],
};

/** True when this flow can offer rush at all. */
export function laneOffersRush(lane: TurnaroundLane): boolean {
  return rushRules.lanes.includes(lane);
}

/**
 * The earliest date the flow accepts once rush is on the table — the
 * picker's `min` for a rush-capable lane. Lanes without rush keep their
 * standard floor exactly as before.
 */
export function earliestRushNeedBy(
  lane: TurnaroundLane,
  today: string = todayIso()
): string {
  if (!laneOffersRush(lane)) return earliestNeedBy(lane, today);

  return addBusinessDays(today, rushRules.minBusinessDays);
}

/**
 * True when the chosen date is inside the rush window: sooner than the
 * standard floor, but not sooner than the rush floor.
 *
 * DERIVED FROM THE DATE, never from a flag the browser sends. A checkbox
 * saying "rush" is a second copy of a fact the date already states, and
 * two copies of one fact is how the size-breakdown reconciliation error
 * happened. It also means the server can recompute the fee from the same
 * input the customer chose, with nothing to tamper with.
 */
export function isRushNeedBy(
  needBy: string,
  lane: TurnaroundLane,
  today: string = todayIso()
): boolean {
  const trimmed = needBy.trim();
  if (!trimmed || !laneOffersRush(lane)) return false;

  return (
    trimmed < earliestNeedBy(lane, today) &&
    trimmed >= earliestRushNeedBy(lane, today)
  );
}

/** The fee itself, rounded to the cent. Zero is zero, never -0 or NaN. */
export function rushFeeFor(goodsSubtotal: number): number {
  if (!(goodsSubtotal > 0)) return 0;

  return Math.round(goodsSubtotal * rushRules.rate * 100) / 100;
}

/**
 * The offer, shown under the date picker BEFORE a date is chosen.
 *
 * `priced` is false on the apparel REQUEST flow, which quotes everything by
 * hand and therefore has no estimate to update. Promising one there would
 * be the same class of lie the request-flow truth fixes (#86/#87) removed:
 * a screen describing something the flow never does.
 */
export function rushOffer(
  lane: TurnaroundLane,
  today: string = todayIso(),
  options: { priced?: boolean } = {}
): string | null {
  if (!laneOffersRush(lane)) return null;

  const standard = formatNeedByDate(earliestNeedBy(lane, today));
  const rush = formatNeedByDate(earliestRushNeedBy(lane, today));
  const percent = Math.round(rushRules.rate * 100);
  const priced = options.priced ?? true;

  const tail = priced
    ? "pick the date and the estimate updates"
    : "pick the date and we'll include it in your quote";

  return `Need it sooner than ${standard}? We can go as early as ${rush} with a ${percent}% rush fee — ${tail}.`;
}

/** The confirmation, shown once a rush date IS chosen. Names the fee. */
export function rushChosenNote(fee: number): string {
  const percent = Math.round(rushRules.rate * 100);

  return `Rush scheduling: +$${fee.toFixed(2)} (${percent}%). We confirm the date with you before anything is charged.`;
}

/** The label the shop email, the payload and Printavo all use. */
export const RUSH_LINE_LABEL = "Rush scheduling";

/**
 * The absolute floor a flow will accept — the rush floor where rush is
 * offered, the standard floor everywhere else. This is what the picker's
 * `min` and the validator both read, so the two can never disagree about
 * what is selectable versus what is submittable.
 */
export function isNeedByRefused(
  needBy: string,
  lane: TurnaroundLane,
  today: string = todayIso()
): boolean {
  const trimmed = needBy.trim();
  if (!trimmed) return false;

  return trimmed < earliestRushNeedBy(lane, today);
}

/** The blocking message. Names the real floor, and the rush one if there is one. */
export function needByRefusedError(
  lane: TurnaroundLane,
  today: string = todayIso()
): string {
  const rule = turnaroundRules[lane];
  const floor = formatNeedByDate(earliestRushNeedBy(lane, today));

  if (laneOffersRush(lane)) {
    return `Even rushed, the earliest we can promise ${rule.products} in hand is ${floor}. Need it sooner? Call or email us.`;
  }

  return `The earliest we can promise ${rule.products} in hand is ${floor}. Need it faster? Call or email us — rush is sometimes possible.`;
}

/**
 * What rush does to a quote: whether it applies, and what it adds.
 *
 * One function so the screen, the payload, the shop email and Printavo all
 * read the same arithmetic from the same inputs — the date the customer
 * picked and the goods the shop is making.
 */
export function applyRush(input: {
  goodsSubtotal: number;
  needBy: string;
  lane: TurnaroundLane;
  today?: string;
}): { isRush: boolean; fee: number } {
  const today = input.today ?? todayIso();

  if (!isRushNeedBy(input.needBy, input.lane, today)) {
    return { isRush: false, fee: 0 };
  }

  return { isRush: true, fee: rushFeeFor(input.goodsSubtotal) };
}
