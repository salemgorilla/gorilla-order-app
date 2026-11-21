/**
 * THE WEEKLY READ: what the review looks at before suggesting anything.
 *
 * Gabe, 2026-11-21, part 2 of "Build both": once a week, look at where
 * people drop off or get stuck and send him suggested changes to approve.
 * This is what that review reads, from GET /api/usage/report. It decides
 * nothing and changes nothing; it only lays the numbers side by side:
 *
 *   - the funnel per product, this period beside the one before, with the
 *     share lost between each step and the next;
 *   - the top picks and the top ordered, per field;
 *   - per colour, how often a click turned into a quote;
 *   - what the learned colour order is doing to each garment right now.
 *
 * Pure. The route does the reading.
 */

import { applyLearnedColorOrder, type LearnedRanking } from "./adaptive-color-order";
import { apparelCatalogItems } from "./apparel-catalog";
import { sortColorsByPopularity, POPULAR_COLOR_COUNT } from "./garment-color-ranking";
import { ORDER_ADAPT, PINNED_COLOR_SLOTS } from "./order-adapt-config";
import {
  FUNNEL_STEPS,
  mergeDailyUsage,
  splitColorKey,
  type Counts,
  type DailyUsage,
  type FunnelStep,
  type PickField,
} from "./order-usage";

export type CountRow = { key: string; label: string; now: number; before: number };

export type FunnelRow = {
  step: FunnelStep;
  visits: number;
  before: number;
  /** Share of the previous step's visits that did not reach this one. */
  lostFromPreviousStep: number | null;
};

export type UsageReport = {
  period: { from: string; to: string; days: number };
  previous: { from: string; to: string };
  headline: string[];
  funnel: Record<string, FunnelRow[]>;
  picks: Record<PickField, CountRow[]>;
  orders: {
    quotes: { now: number; before: number };
    garment: CountRow[];
    color: CountRow[];
    colorPieces: CountRow[];
    placement: CountRow[];
    sizePieces: CountRow[];
  };
  colorConversion: Array<{ label: string; picks: number; quotes: number; quotesPerPick: number }>;
  learnedOrder: Array<{
    style: string;
    garment: string;
    ready: boolean;
    evidence: number;
    neededToStart: number;
    pinned: string[];
    topNow: string[] | null;
  }>;
  quoteNumbers: string[];
  notes: string[];
};

function styleLabel(style: string): string {
  return apparelCatalogItems.find((item) => item.style === style)?.label ?? `Style ${style}`;
}

function labelFor(field: string, key: string): string {
  if (field === "garment") return styleLabel(key);
  if (field === "color" || field === "colorPieces") {
    const { style, color } = splitColorKey(key);
    return `${styleLabel(style)} · ${color}`;
  }
  return key;
}

function rows(field: string, now: Counts, before: Counts, limit = 12): CountRow[] {
  const keys = new Set([...Object.keys(now), ...Object.keys(before)]);
  return [...keys]
    .map((key) => ({
      key,
      label: labelFor(field, key),
      now: Math.round(now[key] || 0),
      before: Math.round(before[key] || 0),
    }))
    .filter((row) => row.now > 0 || row.before > 0)
    .sort((a, b) => b.now - a.now || b.before - a.before || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function share(lost: number, of: number): number {
  return of > 0 ? Math.round((lost / of) * 1000) / 10 : 0;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function buildUsageReport(input: {
  current: DailyUsage[];
  previous: DailyUsage[];
  ranking: LearnedRanking | null;
  /** The catalogue's colour names per style, when the route could load them. */
  catalogColors?: Record<string, string[]>;
}): UsageReport {
  const days = input.current.map((d) => d.day).sort();
  const before = input.previous.map((d) => d.day).sort();
  const now = mergeDailyUsage(days[days.length - 1] ?? "", input.current);
  const prev = mergeDailyUsage(before[before.length - 1] ?? "", input.previous);

  const funnel: Record<string, FunnelRow[]> = {};
  const flows = new Set([...Object.keys(now.funnel), ...Object.keys(prev.funnel)]);
  for (const flow of flows) {
    const nowSteps = now.funnel[flow as keyof typeof now.funnel] || {};
    const prevSteps = prev.funnel[flow as keyof typeof prev.funnel] || {};
    const present = FUNNEL_STEPS.filter(
      (step) => (nowSteps[step] || 0) > 0 || (prevSteps[step] || 0) > 0
    );
    funnel[flow] = present.map((step, index) => {
      const visits = nowSteps[step] || 0;
      const above = index > 0 ? nowSteps[present[index - 1]] || 0 : 0;
      return {
        step,
        visits,
        before: prevSteps[step] || 0,
        lostFromPreviousStep: index > 0 ? share(Math.max(0, above - visits), above) : null,
      };
    });
  }

  const picks = {
    garment: rows("garment", now.picks.garment, prev.picks.garment),
    color: rows("color", now.picks.color, prev.picks.color, 20),
    placement: rows("placement", now.picks.placement, prev.picks.placement),
    size: rows("size", now.picks.size, prev.picks.size),
  };

  const colorConversion = Object.entries(now.picks.color)
    .filter(([, n]) => n >= 5)
    .map(([key, n]) => ({
      label: labelFor("color", key),
      picks: n,
      quotes: now.orders.color[key] || 0,
      quotesPerPick: Math.round(((now.orders.color[key] || 0) / n) * 100) / 100,
    }))
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 20);

  const styles = new Set([
    ...apparelCatalogItems.map((item) => item.style),
    ...Object.keys(input.ranking?.styles ?? {}),
  ]);
  const learnedOrder = [...styles].map((style) => {
    const learning = input.ranking?.styles?.[style];
    const names = input.catalogColors?.[style];
    let topNow: string[] | null = null;
    if (names && names.length > 0) {
      const handWritten = sortColorsByPopularity(
        [...names].sort((a, b) => a.localeCompare(b)).map((colorName) => ({ colorName }))
      );
      topNow = applyLearnedColorOrder(handWritten, style, input.ranking)
        .slice(0, POPULAR_COLOR_COUNT)
        .map((color) => color.colorName);
    }
    return {
      style,
      garment: styleLabel(style),
      ready: Boolean(learning?.ready && ORDER_ADAPT.sortingEnabled),
      evidence: learning?.evidence ?? 0,
      neededToStart: ORDER_ADAPT.minEvidencePerGarment,
      pinned: PINNED_COLOR_SLOTS.map((slot) => slot[0]),
      topNow,
    };
  });

  const headline: string[] = [];
  headline.push(
    `${now.orders.count} apparel quotes reached the shop (${signed(
      now.orders.count - prev.orders.count
    )} on the period before).`
  );
  for (const [flow, steps] of Object.entries(funnel)) {
    const worst = steps
      .filter((row) => row.lostFromPreviousStep !== null && row.visits + row.before > 0)
      .sort((a, b) => (b.lostFromPreviousStep ?? 0) - (a.lostFromPreviousStep ?? 0))[0];
    const top = steps[0];
    const last = steps[steps.length - 1];
    if (top && last && top !== last) {
      headline.push(
        `${flow}: ${top.visits} visits reached "${top.step}", ${last.visits} reached "${last.step}"` +
          (worst ? `; the biggest drop is into "${worst.step}" (${worst.lostFromPreviousStep}% lost).` : ".")
      );
    }
  }
  const sorting = learnedOrder.filter((row) => row.ready).map((row) => row.garment);
  headline.push(
    sorting.length > 0
      ? `Colours are being re-sorted from data on: ${sorting.join(", ")}.`
      : "No garment has enough data yet to be re-sorted; every garment shows the hand-written order."
  );

  return {
    period: { from: days[0] ?? "", to: days[days.length - 1] ?? "", days: days.length },
    previous: { from: before[0] ?? "", to: before[before.length - 1] ?? "" },
    headline,
    funnel,
    picks,
    orders: {
      quotes: { now: now.orders.count, before: prev.orders.count },
      garment: rows("garment", now.orders.garment, prev.orders.garment),
      color: rows("color", now.orders.color, prev.orders.color, 20),
      colorPieces: rows("colorPieces", now.orders.colorPieces, prev.orders.colorPieces, 20),
      placement: rows("placement", now.orders.placement, prev.orders.placement),
      sizePieces: rows("size", now.orders.size, prev.orders.size, 20),
    },
    colorConversion,
    learnedOrder,
    quoteNumbers: now.orders.quoteNumbers,
    notes: [
      "Counts are page visits, not people: nothing identifies a visitor, so one person on two visits counts twice.",
      "A visit is counted when the tab is hidden or closed, or when the quote is sent; a browser that blocks the beacon is not counted.",
      "Quotes are apparel quotes that reached the shop, read on the server. Whether one was PAID lives in Printavo: look up quoteNumbers there.",
      "The shop's scheduled test orders are excluded.",
      `Learned order: quotes count ${ORDER_ADAPT.orderWeight}x a click, a garment needs ${ORDER_ADAPT.minEvidencePerGarment} points before it is re-sorted, activity fades with a ${ORDER_ADAPT.halfLifeDays}-day half-life, rebuilt every ${ORDER_ADAPT.rebuildEveryHours} hours. Pins and knobs: lib/order-adapt-config.ts.`,
    ],
  };
}
