/**
 * WHERE THE USAGE COUNTS LIVE: the shop's own Vercel Blob store.
 *
 * The same store artwork uploads already use, so there is nothing new to
 * provision. It is a PUBLIC store (lib/subscriber-store.ts explains why the
 * newsletter list could not live in it), which is acceptable here because
 * nothing written below names anybody — see lib/order-usage.ts — and every
 * pathname that carries quote numbers gets a random suffix, so its URL
 * cannot be guessed from the date.
 *
 * ── THE LAYOUT ────────────────────────────────────────────────────────────
 * (order-usage/ in production; order-usage-preview/ on a preview deploy.)
 *   order-usage/raw/<day>/visit-<random>.json   one page visit's beacon
 *   order-usage/raw/<day>/order-<random>.json   one quote that reached the shop
 *   order-usage/daily/<day>-<random>.json       a finished day, summed
 *   order-usage/ranking.json                    the learned colour order
 *
 * ── WHY ONE FILE PER EVENT, NOT A COUNTER ─────────────────────────────────
 * Blob has no atomic increment. A shared counter file is read-add-write, and
 * two customers on the page at once would each overwrite the other's click.
 * A new file per visit cannot lose anything. Once a day has been over for
 * two days its files are summed into one daily file and deleted, so reading
 * a month is ~30 reads, not thousands.
 *
 * ── IT NEVER BREAKS THE PAGE ──────────────────────────────────────────────
 * Every call here is wrapped by its caller and fails quiet: a customer's
 * quote must not wait on, or fail because of, the shop counting it.
 */

import { del, get, list, put } from "@vercel/blob";

import {
  buildLearnedRanking,
  type LearnedRanking,
} from "./adaptive-color-order";
import { readBlobCredential } from "./blob-health";
import { ORDER_ADAPT } from "./order-adapt-config";
import {
  addBeacon,
  addDays,
  addOrder,
  emptyDailyUsage,
  mergeDailyUsage,
  shopDay,
  type DailyUsage,
  type OrderUsage,
  type UsageBeacon,
} from "./order-usage";

/**
 * Production counts live under order-usage/; a preview or a laptop gets its
 * own folder, because they share the one blob store and somebody clicking
 * through a preview is not a customer and must not steer the live colours.
 */
export function usagePrefix(env: string | undefined = process.env.VERCEL_ENV): string {
  const name = (env ?? "").trim().toLowerCase();
  return name === "production" ? "order-usage/" : `order-usage-${name === "preview" ? "preview" : "dev"}/`;
}

export const USAGE_PREFIX = usagePrefix();
const RAW = `${USAGE_PREFIX}raw/`;
const DAILY = `${USAGE_PREFIX}daily/`;
export const RANKING_PATH = `${USAGE_PREFIX}ranking.json`;

/** Days a raw file waits before it is rolled into its day's summary. */
const ROLL_UP_AFTER_DAYS = 2;

export type StoredBlob = { pathname: string; url: string; uploadedAt: string };

/** The four things the logic needs, so tests can run it against a Map. */
export type UsageBlobStore = {
  write(pathname: string, body: string, options: { random: boolean }): Promise<void>;
  read(blob: StoredBlob | string): Promise<string | null>;
  list(prefix: string): Promise<StoredBlob[]>;
  remove(urls: string[]): Promise<void>;
};

/**
 * Is tracking on? It needs a blob credential, and USAGE_TRACKING=off in
 * Vercel stops all of it — no beacon is stored and no order is counted —
 * without a code change. Sorting has its own switch in
 * lib/order-adapt-config.ts.
 */
export function isUsageTrackingEnabled(): boolean {
  const flag = (process.env.USAGE_TRACKING ?? "").trim().toLowerCase();
  if (flag === "off" || flag === "false" || flag === "0") return false;
  return readBlobCredential() !== "none";
}

export function vercelUsageStore(): UsageBlobStore {
  return {
    async write(pathname, body, { random }) {
      await put(pathname, body, {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: random,
        allowOverwrite: !random,
        cacheControlMaxAge: 60,
      });
    },

    async read(blob) {
      if (typeof blob === "string") {
        const result = await get(blob, { access: "public", useCache: false });
        if (!result || result.statusCode !== 200) return null;
        return await new Response(result.stream).text();
      }
      const response = await fetch(blob.url, { cache: "no-store" });
      return response.ok ? await response.text() : null;
    },

    async list(prefix) {
      const found: StoredBlob[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 1000 });
        for (const blob of page.blobs) {
          found.push({
            pathname: blob.pathname,
            url: blob.url,
            uploadedAt: new Date(blob.uploadedAt).toISOString(),
          });
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return found;
    },

    async remove(urls) {
      for (let at = 0; at < urls.length; at += 500) {
        await del(urls.slice(at, at + 500));
      }
    },
  };
}

type RawRecord =
  | { type: "visit"; beacons: UsageBeacon[] }
  | { type: "order"; order: OrderUsage };

/** One page visit's post: a beacon per product they looked at. */
export async function recordVisit(
  store: UsageBlobStore,
  beacons: UsageBeacon[],
  now: Date = new Date()
): Promise<void> {
  if (beacons.length === 0) return;
  const record: RawRecord = { type: "visit", beacons };
  await store.write(`${RAW}${shopDay(now)}/visit.json`, JSON.stringify(record), {
    random: true,
  });
}

export async function recordOrder(
  store: UsageBlobStore,
  order: OrderUsage,
  now: Date = new Date()
): Promise<void> {
  const record: RawRecord = { type: "order", order };
  await store.write(`${RAW}${shopDay(now)}/order.json`, JSON.stringify(record), {
    random: true,
  });
}

/** "order-usage/raw/2026-11-21/visit-abc.json" → "2026-11-21". */
function dayOfRaw(pathname: string): string {
  return pathname.slice(RAW.length, RAW.length + 10);
}

/** "order-usage/daily/2026-11-21-abc.json" → "2026-11-21". */
function dayOfDaily(pathname: string): string {
  return pathname.slice(DAILY.length, DAILY.length + 10);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function group(blobs: StoredBlob[], dayOf: (pathname: string) => string) {
  const byDay = new Map<string, StoredBlob[]>();
  for (const blob of blobs) {
    const day = dayOf(blob.pathname);
    if (!DAY.test(day)) continue;
    const list = byDay.get(day) || [];
    list.push(blob);
    byDay.set(day, list);
  }
  // Earliest first, so when two roll-ups raced and wrote a day twice, the
  // first one — written before anything was deleted — is the one read.
  for (const list of byDay.values()) {
    list.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  }
  return byDay;
}

async function readJson<T>(store: UsageBlobStore, blob: StoredBlob): Promise<T | null> {
  try {
    const text = await store.read(blob);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

async function sumRaw(store: UsageBlobStore, day: string, blobs: StoredBlob[]) {
  const total = emptyDailyUsage(day);
  // A few at a time: a busy day is hundreds of small files.
  for (let at = 0; at < blobs.length; at += 25) {
    const records = await Promise.all(
      blobs.slice(at, at + 25).map((blob) => readJson<RawRecord>(store, blob))
    );
    for (const record of records) {
      if (record?.type === "visit" && Array.isArray(record.beacons)) {
        for (const beacon of record.beacons) addBeacon(total, beacon);
      }
      else if (record?.type === "order" && record.order) addOrder(total, record.order);
    }
  }
  return total;
}

/**
 * Every day from `from` to `to`, inclusive, summed per day.
 *
 * A finished day is read from its summary; a recent one from its raw files.
 * A day with a summary ignores any raw files still beside it — those are
 * the ones a roll-up summed and had not yet deleted.
 */
export async function loadUsageDays(
  store: UsageBlobStore,
  from: string,
  to: string
): Promise<DailyUsage[]> {
  const [dailyBlobs, rawBlobs] = await Promise.all([
    store.list(DAILY),
    store.list(RAW),
  ]);
  const daily = group(dailyBlobs, dayOfDaily);
  const raw = group(rawBlobs, dayOfRaw);

  const days: DailyUsage[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const summary = daily.get(day)?.[0];
    if (summary) {
      const stored = await readJson<DailyUsage>(store, summary);
      days.push(mergeDailyUsage(day, stored ? [stored] : []));
    } else if (raw.has(day)) {
      days.push(await sumRaw(store, day, raw.get(day)!));
    } else {
      days.push(emptyDailyUsage(day));
    }
  }
  return days;
}

/**
 * Sum each finished day's raw files into one summary and delete them.
 *
 * Only days at least two days old, so nothing is still arriving for them.
 * Safe to run twice: a day that already has a summary is not summed again,
 * its leftover raw files are just deleted, and duplicate summaries from a
 * race are trimmed to the earliest.
 */
export async function rollUpUsage(
  store: UsageBlobStore,
  today: string = shopDay()
): Promise<{ summarised: string[] }> {
  const [dailyBlobs, rawBlobs] = await Promise.all([
    store.list(DAILY),
    store.list(RAW),
  ]);
  const daily = group(dailyBlobs, dayOfDaily);
  const raw = group(rawBlobs, dayOfRaw);
  const cutoff = addDays(today, -ROLL_UP_AFTER_DAYS);
  const summarised: string[] = [];

  for (const extras of daily.values()) {
    if (extras.length > 1) await store.remove(extras.slice(1).map((blob) => blob.url));
  }

  for (const [day, blobs] of [...raw].sort(([a], [b]) => a.localeCompare(b))) {
    if (day > cutoff) continue;
    if (!daily.has(day)) {
      const total = await sumRaw(store, day, blobs);
      await store.write(`${DAILY}${day}.json`, JSON.stringify(total), { random: true });
      summarised.push(day);
    }
    await store.remove(blobs.map((blob) => blob.url));
  }

  return { summarised };
}

/** Roll up, then rebuild the learned order from the window and store it. */
export async function rebuildLearnedRanking(
  store: UsageBlobStore,
  now: Date = new Date()
): Promise<LearnedRanking> {
  const today = shopDay(now);
  await rollUpUsage(store, today);
  const days = await loadUsageDays(store, addDays(today, -ORDER_ADAPT.windowDays), today);
  const ranking = buildLearnedRanking(days, today, ORDER_ADAPT, now.toISOString());
  await store.write(RANKING_PATH, JSON.stringify(ranking), { random: false });
  rankingCache = { ranking, readAt: now.getTime() };
  return ranking;
}

/**
 * The stored ranking, kept in memory for a few minutes so a burst of
 * catalogue loads is one read. Null when there is none yet or it cannot be
 * read — the caller then shows the hand-written order.
 */
let rankingCache: { ranking: LearnedRanking | null; readAt: number } | null = null;
const RANKING_CACHE_MS = 10 * 60_000;

export async function readLearnedRanking(
  store: UsageBlobStore,
  now: number = Date.now()
): Promise<LearnedRanking | null> {
  if (rankingCache && now - rankingCache.readAt < RANKING_CACHE_MS) {
    return rankingCache.ranking;
  }
  let ranking: LearnedRanking | null = null;
  try {
    const text = await store.read(RANKING_PATH);
    const parsed = text ? (JSON.parse(text) as LearnedRanking) : null;
    ranking = parsed?.version === 1 ? parsed : null;
  } catch {
    ranking = null;
  }
  rankingCache = { ranking, readAt: now };
  return ranking;
}

/** Tests only. */
export function resetRankingCache() {
  rankingCache = null;
}
