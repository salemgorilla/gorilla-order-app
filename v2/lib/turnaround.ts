/**
 * Turnaround floors — the earliest "needed in hand" date each flow may ask
 * for. Before this rule the date picker allowed TODAY on every flow, so a
 * customer could order 24 screen-printed shirts in hand the same afternoon
 * and the form accepted the promise. For stickers that is worse than
 * awkward: stickers auto-bill, so an impossible date could be paid for
 * before anyone at the shop saw it.
 *
 * THE SPEC IS DATA (the reference-quote pattern): the day counts below are
 * Gabe's numbers, set 2026-08-31, and this object is the one place to
 * change them.
 *
 * Three lanes, keyed on the product families the banners/signs hard split
 * already created, plus where the order is being taken:
 *
 *   walkin — fast-lane work at the shop's own counter (the kiosk): TODAY
 *            is allowed, because staff is standing there to agree to it.
 *   fast   — stickers and vinyl banners on the web: printed in-house on
 *            the roll, ready as soon as the NEXT business day.
 *   slow   — apparel, yard signs and rigid signs: blanks ordered in,
 *            screens burned, substrate cut — 14 business days, counter or
 *            not.
 *
 * The floor BLOCKS, with an out: the picker's min stops earlier dates, the
 * validator catches anything typed past the picker, and the copy tells the
 * customer rush may be possible by phone or email. It floors the promise,
 * not the enthusiasm.
 */

export type TurnaroundLane = "walkin" | "fast" | "slow";

export const turnaroundRules: Record<
  TurnaroundLane,
  { minBusinessDays: number; products: string; promise: string }
> = {
  /**
   * The shop's own counter, for work printed on the roll. A walk-in is
   * standing in front of the person who runs the press, and the floor
   * exists to stop the WEB promising what nobody heard — that reason does
   * not apply when staff is right there. So the kiosk may promise today,
   * for fast-lane products only: a walk-in asking for 24 screen-printed
   * shirts still waits on blanks and screens like everyone else, and
   * turnaroundLaneFor keeps them in the slow lane.
   */
  walkin: {
    minBusinessDays: 0,
    products: "stickers and banners",
    promise: "often same day in the shop",
  },
  fast: {
    minBusinessDays: 1,
    products: "stickers and banners",
    promise: "ready as soon as the next business day",
  },
  slow: {
    minBusinessDays: 14,
    products: "apparel and signs",
    promise: "about three weeks (14 business days)",
  },
};

/**
 * Which lane a flow is in. Banners ride the fast lane with stickers; the
 * Signs pipeline (yard + rigid) keeps apparel's floor — Gabe's grouping,
 * verbatim.
 */
export function turnaroundLaneFor(flow: {
  isApparel: boolean;
  isSigns: boolean;
  signsFamily: "banners" | "signs";
  /** True on the shop's own terminal — see the walkin rule above. */
  isKiosk?: boolean;
}): TurnaroundLane {
  if (flow.isApparel) return "slow";
  if (flow.isSigns && flow.signsFamily !== "banners") return "slow";

  // Fast-lane work (stickers, banners) — same day when a person is at the
  // counter to say yes to it, next business day on the web.
  return flow.isKiosk ? "walkin" : "fast";
}

/**
 * Today as YYYY-MM-DD, UTC — the convention NeedByDate's old `min={today}`
 * already used. UTC runs ahead of the shop's clock, so in the evening this
 * can only make the floor STRICTER by a day, never looser; a promise the
 * validator allows is one the calendar allows.
 */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** `days` business days (Mon–Fri) after `fromIso`, as YYYY-MM-DD. */
export function addBusinessDays(fromIso: string, days: number): string {
  const date = new Date(`${fromIso}T00:00:00Z`);

  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }

  return date.toISOString().slice(0, 10);
}

/** The earliest date the picker and the validator both accept. */
export function earliestNeedBy(
  lane: TurnaroundLane,
  today: string = todayIso()
): string {
  return addBusinessDays(today, turnaroundRules[lane].minBusinessDays);
}

/** "Tue, Sep 15" — for prose. UTC so the label matches the ISO date. */
export function formatNeedByDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * True when the date is set but promises sooner than the lane allows.
 * ISO date strings compare correctly as strings; an empty date is not
 * "too soon", it is missing, and the required rule owns that message.
 */
export function isNeedByTooSoon(
  needBy: string,
  lane: TurnaroundLane,
  today: string = todayIso()
): boolean {
  const trimmed = needBy.trim();
  if (!trimmed) return false;

  return trimmed < earliestNeedBy(lane, today);
}

/** The blocking message, with the out. Shown under the date field. */
export function needByTooSoonError(
  lane: TurnaroundLane,
  today: string = todayIso()
): string {
  const rule = turnaroundRules[lane];
  const earliest = formatNeedByDate(earliestNeedBy(lane, today));

  return `The earliest we can promise ${rule.products} in hand is ${earliest}. Need it faster? Call or email us — rush is sometimes possible.`;
}

/** The standing note under the date picker, before anything goes wrong. */
export function turnaroundNote(lane: TurnaroundLane): string {
  const rule = turnaroundRules[lane];

  if (lane === "walkin") {
    // No "call us" out: the customer IS here, talking to staff.
    return `Stickers and banners are ${rule.promise} — ask us about today.`;
  }

  return lane === "fast"
    ? `Stickers and banners are ${rule.promise}. Need it faster? Call or email us.`
    : `Apparel and signs take ${rule.promise}. Need it faster? Call or email us — rush is sometimes possible.`;
}
