/**
 * THE COLOUR ORDER THAT LEARNS.
 *
 * lib/garment-color-ranking.ts is the order Gabe and the shop's S&S invoices
 * agreed on, by hand. This re-sorts each garment from what customers here
 * actually pick and order (lib/order-usage.ts), under four rules:
 *
 *   1. PINS NEVER MOVE. PINNED_COLOR_SLOTS lead every garment, in their
 *      order, whatever the data says.
 *   2. ORDERS OUTWEIGH CLICKS. A colour in a quote that reached the shop
 *      counts `orderWeight` times a colour somebody only clicked.
 *   3. NOTHING MOVES ON A HANDFUL. A garment is re-sorted only once it has
 *      `minEvidencePerGarment` behind it; until then it shows exactly the
 *      hand-written order.
 *   4. CHANGE IS GRADUAL. The hand-written order is a PRIOR worth
 *      `priorStrength` points, spread from its top slot down, and every
 *      customer action fades with a `halfLifeDays` half-life. So a colour
 *      climbs a few places as evidence builds, rather than jumping, and the
 *      list is rebuilt once a day so nobody sees it reshuffle mid-visit.
 *
 * Pure: give it the days, get the ranking. Reading and writing it is
 * lib/order-usage-store.ts; applying it is the catalogue route.
 */

import { GARMENT_COLOR_RANKING } from "./garment-color-ranking";
import { ORDER_ADAPT, PINNED_COLOR_SLOTS } from "./order-adapt-config";
import { daysBetween, splitColorKey, type DailyUsage } from "./order-usage";

export type AdaptConfig = {
  sortingEnabled: boolean;
  pickWeight: number;
  orderWeight: number;
  minEvidencePerGarment: number;
  priorStrength: number;
  halfLifeDays: number;
  windowDays: number;
  rebuildEveryHours: number;
};

export type StyleLearning = {
  /** Weighted, faded evidence behind this garment: clicks x1 + quotes x5. */
  evidence: number;
  /** Whether it has crossed minEvidencePerGarment and is being re-sorted. */
  ready: boolean;
  /** Lower-cased colour name → its learned score. */
  scores: Record<string, number>;
};

export type LearnedRanking = {
  version: 1;
  builtAt: string;
  /** The shop day the ranking was built through, inclusive. */
  throughDay: string;
  styles: Record<string, StyleLearning>;
};

/**
 * Sum the days into per-garment colour scores.
 *
 * `today` is passed, never read from the clock, so a test means the same
 * thing next year (v2/AGENTS.md, "Never pin a test fixture to a literal date").
 */
export function buildLearnedRanking(
  days: readonly DailyUsage[],
  today: string,
  config: AdaptConfig = ORDER_ADAPT,
  builtAt: string = new Date().toISOString()
): LearnedRanking {
  const styles: Record<string, StyleLearning> = {};

  const styleFor = (style: string) =>
    (styles[style] ||= { evidence: 0, ready: false, scores: {} });

  for (const day of days) {
    const age = daysBetween(day.day, today);
    if (age < 0 || age > config.windowDays) continue;
    const fade = Math.pow(0.5, age / Math.max(1, config.halfLifeDays));

    const add = (counts: Record<string, number> | undefined, weight: number) => {
      for (const [key, count] of Object.entries(counts || {})) {
        const { style, color } = splitColorKey(key);
        if (!style || !color || !(count > 0)) continue;
        const points = count * weight * fade;
        const learning = styleFor(style);
        const name = color.toLowerCase();
        learning.scores[name] = (learning.scores[name] || 0) + points;
        learning.evidence += points;
      }
    };

    add(day.picks?.color, config.pickWeight);
    add(day.orders?.color, config.orderWeight);
  }

  for (const learning of Object.values(styles)) {
    learning.evidence = round(learning.evidence);
    for (const name of Object.keys(learning.scores)) {
      learning.scores[name] = round(learning.scores[name]);
    }
    learning.ready = learning.evidence >= config.minEvidencePerGarment;
  }

  return { version: 1, builtAt, throughDay: today, styles };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type Named = { colorName: string };

/**
 * Which slot of a ranking each colour took, the same way
 * sortColorsByPopularity() assigns them: per slot, the first of its names
 * the garment has. Colours no slot named are absent from the map.
 */
function slotOf<T extends Named>(
  colors: readonly T[],
  ranking: readonly (readonly string[])[]
): Map<T, number> {
  const byName = new Map<string, T>();
  for (const color of colors) {
    const key = color.colorName.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, color);
  }

  const slots = new Map<T, number>();
  ranking.forEach((slot, index) => {
    for (const name of slot) {
      const match = byName.get(name.trim().toLowerCase());
      if (match && !slots.has(match)) {
        slots.set(match, index);
        break;
      }
    }
  });
  return slots;
}

/**
 * One garment's colours in learned order.
 *
 * `colors` is the catalogue's list, already in hand-written order. Returned
 * unchanged — same array contents, same order — when sorting is off, the
 * garment is unknown to the ranking, or it has not got enough evidence yet.
 * Never drops or duplicates a colour, and does not mutate its input.
 */
export function applyLearnedColorOrder<T extends Named>(
  colors: readonly T[],
  style: string,
  ranking: LearnedRanking | null | undefined,
  options: {
    config?: AdaptConfig;
    pins?: readonly (readonly string[])[];
    prior?: readonly (readonly string[])[];
  } = {}
): T[] {
  const config = options.config ?? ORDER_ADAPT;
  const pins = options.pins ?? PINNED_COLOR_SLOTS;
  const prior = options.prior ?? GARMENT_COLOR_RANKING;

  const learning = ranking?.styles?.[style];
  if (!config.sortingEnabled || !learning || !learning.ready) return [...colors];

  // 1. Pins, in pin order.
  const pinSlots = slotOf(colors, pins);
  const pinned = [...pinSlots.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([color]) => color);
  const pinnedSet = new Set<T>(pinned);

  // 2. Everyone else by prior + learned. The prior is the hand-written slot
  // AFTER the pins, so the pins' own places do not eat the scale.
  const priorSlots = slotOf(
    colors.filter((color) => !pinnedSet.has(color)),
    prior.filter((slot) => !pins.includes(slot))
  );
  const slotCount = Math.max(1, prior.length - pins.length);

  const scored = colors
    .map((color, index) => {
      if (pinnedSet.has(color)) return null;
      const slot = priorSlots.get(color);
      const priorScore =
        slot === undefined ? 0 : config.priorStrength * (1 - slot / slotCount);
      const learned = learning.scores[color.colorName.trim().toLowerCase()] || 0;
      return { color, index, score: priorScore + learned };
    })
    .filter((entry): entry is { color: T; index: number; score: number } => entry !== null);

  // Highest score first; a tie keeps the hand-written order, so a colour
  // with no data never jumps a colour with none either.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return [...pinned, ...scored.map((entry) => entry.color)];
}

/** Has the stored ranking aged out? */
export function rankingIsStale(
  ranking: LearnedRanking | null | undefined,
  now: Date = new Date(),
  config: AdaptConfig = ORDER_ADAPT
): boolean {
  if (!ranking?.builtAt) return true;
  const age = now.getTime() - Date.parse(ranking.builtAt);
  return !(age >= 0) || age > config.rebuildEveryHours * 3_600_000;
}
