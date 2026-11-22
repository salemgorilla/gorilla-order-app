/**
 * THE ORDER PAGE THAT ADAPTS — Gabe, 2026-11-21: "Build both".
 *
 * What is counted (picks, quotes that reached the shop, funnel steps), that
 * none of it can carry a person, how the learned colour order decides, and
 * what the weekly review reads. Every date is passed explicitly, so these
 * mean the same thing next year (v2/AGENTS.md).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  applyLearnedColorOrder,
  buildLearnedRanking,
  rankingIsStale,
  type AdaptConfig,
} from "../lib/adaptive-color-order";
import { sortColorsByPopularity } from "../lib/garment-color-ranking";
import { ORDER_ADAPT, PINNED_COLOR_SLOTS } from "../lib/order-adapt-config";
import {
  addBeacon,
  addDays,
  addOrder,
  colorKey,
  emptyDailyUsage,
  mergeDailyUsage,
  orderUsageFromPayload,
  parseSizeBreakdown,
  parseUsageBeacon,
  parseUsagePost,
  shopDay,
  type DailyUsage,
} from "../lib/order-usage";
import {
  loadUsageDays,
  RANKING_PATH,
  readLearnedRanking,
  rebuildLearnedRanking,
  recordOrder,
  recordVisit,
  resetRankingCache,
  rollUpUsage,
  usagePrefix,
  type StoredBlob,
  type UsageBlobStore,
} from "../lib/order-usage-store";
import {
  flushUsage,
  isTestIdentity,
  pendingUsageForTest,
  recordUsagePick,
  recordUsageStep,
  resetUsageBeacon,
  suppressUsage,
} from "../lib/usage-beacon";
import { buildUsageReport } from "../lib/usage-report";

const BASIC_TEE = "39";
const PREMIUM_TEE = "7584";
const HOODIE = "395";
const TODAY = "2026-11-21";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/ss-color-names-2026-11-21.json", import.meta.url), "utf8")
) as { styles: Record<string, string[]> };

/** A garment's colours as the catalogue hands them over: hand-written order. */
function catalogColors(style: string) {
  return sortColorsByPopularity(
    [...fixture.styles[style]].sort((a, b) => a.localeCompare(b)).map((colorName) => ({ colorName }))
  );
}

function names(colors: { colorName: string }[]) {
  return colors.map((color) => color.colorName);
}

/** A day with `n` quotes of one colour and `p` clicks on it. */
function dayWith(day: string, style: string, color: string, quotes: number, clicks = 0) {
  const usage = emptyDailyUsage(day);
  for (let i = 0; i < quotes; i++) {
    addOrder(usage, { quoteNumber: "", lines: [{ style, color, quantity: 24, sizes: {} }], placements: [] });
  }
  if (clicks > 0) usage.picks.color[colorKey(style, color)] = clicks;
  return usage;
}

describe("what the browser may send", () => {
  it("keeps garments the shop sells, real placements, and short colour and size names", () => {
    const beacon = parseUsageBeacon({
      flow: "apparel",
      steps: ["product_chosen", "garment_chosen", "made_up_step"],
      picks: [
        { field: "garment", style: BASIC_TEE },
        { field: "garment", style: "99999" },
        { field: "color", style: BASIC_TEE, color: "Sport Grey" },
        { field: "color", style: BASIC_TEE, color: "Sport Grey" },
        { field: "placement", value: "Left Chest" },
        { field: "placement", value: "Inside the hood" },
        { field: "size", value: "2xl" },
      ],
    });

    assert.deepEqual(beacon, {
      flow: "apparel",
      steps: ["product_chosen", "garment_chosen"],
      picks: [
        { field: "garment", style: BASIC_TEE },
        { field: "color", style: BASIC_TEE, color: "Sport Grey" },
        { field: "placement", value: "Left Chest" },
        { field: "size", value: "2XL" },
      ],
    });
  });

  it("cannot carry an email address, a phone number or a note in any field", () => {
    const beacon = parseUsageBeacon({
      flow: "apparel",
      steps: ["product_chosen"],
      picks: [
        { field: "color", style: BASIC_TEE, color: "jane@example.com" },
        { field: "color", style: BASIC_TEE, color: "978 745 7755" },
        { field: "color", style: BASIC_TEE, color: "Please call me after 5pm about the order" },
        { field: "size", value: "9787457755" },
        { field: "garment", style: "jane@example.com" },
        { field: "placement", value: "Call 978-745-7755" },
      ],
    });

    assert.deepEqual(beacon?.picks, []);
    // And nothing else rides along: the kept beacon has exactly three keys.
    assert.deepEqual(Object.keys(beacon ?? {}).sort(), ["flow", "picks", "steps"]);
  });

  it("refuses an unknown product, and keeps one beacon per product per post", () => {
    assert.equal(parseUsageBeacon({ flow: "mugs", steps: ["product_chosen"] }), null);
    const post = parseUsagePost({
      beacons: [
        { flow: "stickers", steps: ["product_chosen"] },
        { flow: "stickers", steps: ["submitted"] },
        { flow: "apparel", steps: ["product_chosen"] },
      ],
    });
    assert.deepEqual(post.map((b) => [b.flow, b.steps]), [
      ["stickers", ["product_chosen"]],
      ["apparel", ["product_chosen"]],
    ]);
  });
});

describe("what a quote that reached the shop ordered", () => {
  it("reads a one-garment quote from its supplier block and size breakdown", () => {
    const usage = orderUsageFromPayload(
      {
        product: {
          garmentType: "Basic Tee",
          garmentColor: "Navy",
          quantity: 36,
          printLocations: ["Front", "Back", "Not a place"],
          sizeBreakdown: "S-6, M-12, L-12, XL-6",
          supplier: { catalogStyle: BASIC_TEE, colorName: "Navy" },
        },
        pricing: { total: 400 },
      },
      "GS-20261121-ABCD1234"
    );

    assert.deepEqual(usage, {
      quoteNumber: "GS-20261121-ABCD1234",
      lines: [{ style: BASIC_TEE, color: "Navy", quantity: 36, sizes: { S: 6, M: 12, L: 12, XL: 6 } }],
      placements: ["Front", "Back"],
    });
  });

  it("reads every garment of a cart from its own line", () => {
    const usage = orderUsageFromPayload(
      {
        product: { garmentColor: "Black", quantity: 60, printLocations: ["Front"], supplier: { catalogStyle: BASIC_TEE } },
        pricing: {
          lines: [
            { catalogStyle: BASIC_TEE, colorName: "Black", quantity: 36, sizeBreakdown: "M-18, L-18" },
            { catalogStyle: HOODIE, colorName: "Maroon", quantity: 24, sizeBreakdown: "L-24" },
          ],
        },
      },
      "GS-20261121-ZZZZ9999"
    );

    assert.deepEqual(
      usage?.lines.map((line) => [line.style, line.color, line.quantity]),
      [
        [BASIC_TEE, "Black", 36],
        [HOODIE, "Maroon", 24],
      ]
    );
  });

  it("counts nothing for stickers, or for a garment request that chose nothing", () => {
    assert.equal(orderUsageFromPayload({ product: { type: "Custom Stickers" } }, "GS-20261121-AAAA1111"), null);
    assert.equal(
      orderUsageFromPayload(
        { product: { garmentColor: "", supplier: { catalogStyle: "Not selected", colorName: "Not selected" } } },
        "GS-20261121-AAAA1111"
      ),
      null
    );
  });

  it("drops a quote number that is not the shop's own shape", () => {
    const usage = orderUsageFromPayload(
      { product: { garmentColor: "Black", supplier: { catalogStyle: BASIC_TEE } } },
      "jane@example.com"
    );
    assert.equal(usage?.quoteNumber, "");
  });

  it("parses sizes the way the page writes them, skipping junk", () => {
    assert.deepEqual(parseSizeBreakdown("S-2, M-4, 2XL-1, nonsense, L-0"), { S: 2, M: 4, "2XL": 1 });
  });
});

describe("summing a day", () => {
  it("counts a quote once per garment and colour, and pieces per size", () => {
    const day = emptyDailyUsage(TODAY);
    addOrder(day, {
      quoteNumber: "GS-20261121-ABCD1234",
      lines: [
        { style: BASIC_TEE, color: "Black", quantity: 12, sizes: { M: 6, L: 6 } },
        { style: BASIC_TEE, color: "Black", quantity: 12, sizes: { XL: 12 } },
      ],
      placements: ["Front"],
    });
    addBeacon(day, { flow: "apparel", steps: ["product_chosen", "submitted"], picks: [{ field: "color", style: BASIC_TEE, color: "Black" }] });

    assert.equal(day.orders.count, 1);
    assert.equal(day.orders.color[colorKey(BASIC_TEE, "Black")], 1);
    assert.equal(day.orders.colorPieces[colorKey(BASIC_TEE, "Black")], 24);
    assert.deepEqual(day.orders.size, { M: 6, L: 6, XL: 12 });
    assert.deepEqual(day.funnel.apparel, { product_chosen: 1, submitted: 1 });

    const twice = mergeDailyUsage(TODAY, [day, day]);
    assert.equal(twice.orders.count, 2);
    assert.deepEqual(twice.orders.quoteNumbers, ["GS-20261121-ABCD1234"]);
  });

  it("uses the shop's day in Salem, not UTC", () => {
    // 2:30 AM UTC on the 22nd is still the evening of the 21st in Salem.
    assert.equal(shopDay(new Date("2026-11-22T02:30:00Z")), "2026-11-21");
    assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  });
});

describe("the learned colour order", () => {
  const config: AdaptConfig = { ...ORDER_ADAPT };

  it("shows the hand-written order exactly until a garment has enough evidence", () => {
    const colors = catalogColors(BASIC_TEE);
    // Five clicks on a long-tail colour: well under the minimum.
    const ranking = buildLearnedRanking([dayWith(TODAY, BASIC_TEE, "Lime", 0, 5)], TODAY, config);

    assert.equal(ranking.styles[BASIC_TEE].ready, false);
    assert.deepEqual(names(applyLearnedColorOrder(colors, BASIC_TEE, ranking, { config })), names(colors));
  });

  it("never moves the pins, however much the data prefers another colour", () => {
    const colors = catalogColors(BASIC_TEE);
    const ranking = buildLearnedRanking([dayWith(TODAY, BASIC_TEE, "Lime", 200, 500)], TODAY, config);
    const sorted = names(applyLearnedColorOrder(colors, BASIC_TEE, ranking, { config }));

    assert.deepEqual(sorted.slice(0, 3), ["Black", "Navy", "Sport Grey"]);
    assert.equal(sorted[3], "Lime");
  });

  it("leads with the Bella+Canvas names for the same three pins", () => {
    const colors = catalogColors(PREMIUM_TEE);
    const ranking = buildLearnedRanking([dayWith(TODAY, PREMIUM_TEE, "Heather Mauve", 100)], TODAY, config);
    const sorted = names(applyLearnedColorOrder(colors, PREMIUM_TEE, ranking, { config }));
    assert.deepEqual(sorted.slice(0, 3), ["Solid Black Blend", "Heather Navy", "Athletic Heather"]);
  });

  it("weighs a quote more than a click", () => {
    const colors = catalogColors(BASIC_TEE);
    const day = dayWith(TODAY, BASIC_TEE, "Lime", 0, 40);
    addOrder(day, { quoteNumber: "", lines: [{ style: BASIC_TEE, color: "Daisy", quantity: 24, sizes: {} }], placements: [] });
    for (let i = 0; i < 9; i++) {
      addOrder(day, { quoteNumber: "", lines: [{ style: BASIC_TEE, color: "Daisy", quantity: 24, sizes: {} }], placements: [] });
    }
    // Lime: 40 clicks = 40 points. Daisy: 10 quotes = 50 points.
    const ranking = buildLearnedRanking([day], TODAY, config);
    const sorted = names(applyLearnedColorOrder(colors, BASIC_TEE, ranking, { config }));
    assert.ok(sorted.indexOf("Daisy") < sorted.indexOf("Lime"));
  });

  it("moves gradually: a couple of quotes lift a colour, not into the top twelve", () => {
    const colors = catalogColors(BASIC_TEE);
    // A realistic first stretch: twelve quotes, ten of them Black (pinned
    // anyway), two in Lime. Enough to turn sorting on for this garment.
    const day = dayWith(TODAY, BASIC_TEE, "Black", 10);
    addOrder(day, { quoteNumber: "", lines: [{ style: BASIC_TEE, color: "Lime", quantity: 24, sizes: {} }], placements: [] });
    addOrder(day, { quoteNumber: "", lines: [{ style: BASIC_TEE, color: "Lime", quantity: 24, sizes: {} }], placements: [] });
    const ranking = buildLearnedRanking([day], TODAY, config);
    const sorted = names(applyLearnedColorOrder(colors, BASIC_TEE, ranking, { config }));

    assert.equal(ranking.styles[BASIC_TEE].ready, true);
    // The hand-written top holds: White is still the first slot after the pins.
    assert.deepEqual(sorted.slice(0, 4), ["Black", "Navy", "Sport Grey", "White"]);
    // Lime climbs out of the alphabetical tail, but two quotes are not
    // enough to put it on the first screen.
    assert.ok(sorted.indexOf("Lime") < names(colors).indexOf("Lime"));
    assert.ok(sorted.indexOf("Lime") >= 12);
  });

  it("lets a colour that keeps getting ordered reach the first screen", () => {
    const colors = catalogColors(BASIC_TEE);
    const ranking = buildLearnedRanking([dayWith(TODAY, BASIC_TEE, "Lime", 12)], TODAY, config);
    const sorted = names(applyLearnedColorOrder(colors, BASIC_TEE, ranking, { config }));
    assert.ok(sorted.indexOf("Lime") < 12);
    assert.deepEqual(sorted.slice(0, 3), ["Black", "Navy", "Sport Grey"]);
  });

  it("lets old activity fade", () => {
    const recent = buildLearnedRanking([dayWith(TODAY, BASIC_TEE, "Lime", 20)], TODAY, config);
    const old = buildLearnedRanking([dayWith(addDays(TODAY, -60), BASIC_TEE, "Lime", 20)], TODAY, config);
    // Sixty days at a thirty-day half-life is a quarter.
    assert.equal(old.styles[BASIC_TEE].scores.lime, recent.styles[BASIC_TEE].scores.lime / 4);
    // Outside the window counts for nothing at all.
    const ancient = buildLearnedRanking([dayWith(addDays(TODAY, -365), BASIC_TEE, "Lime", 20)], TODAY, config);
    assert.equal(ancient.styles[BASIC_TEE], undefined);
  });

  it("never drops or duplicates a colour, and keeps each garment's own data apart", () => {
    const ranking = buildLearnedRanking(
      [dayWith(TODAY, BASIC_TEE, "Lime", 50), dayWith(TODAY, HOODIE, "Maroon", 50)],
      TODAY,
      config
    );
    for (const style of [BASIC_TEE, PREMIUM_TEE, HOODIE]) {
      const colors = catalogColors(style);
      const sorted = names(applyLearnedColorOrder(colors, style, ranking, { config }));
      assert.deepEqual([...sorted].sort(), [...names(colors)].sort());
      assert.equal(new Set(sorted).size, sorted.length);
    }
    // The premium tee has no data of its own and is untouched.
    assert.deepEqual(
      names(applyLearnedColorOrder(catalogColors(PREMIUM_TEE), PREMIUM_TEE, ranking, { config })),
      names(catalogColors(PREMIUM_TEE))
    );
  });

  it("goes back to the hand-written order when sorting is switched off", () => {
    const colors = catalogColors(BASIC_TEE);
    const ranking = buildLearnedRanking([dayWith(TODAY, BASIC_TEE, "Lime", 200)], TODAY, config);
    const off = applyLearnedColorOrder(colors, BASIC_TEE, ranking, { config: { ...config, sortingEnabled: false } });
    assert.deepEqual(names(off), names(colors));
    assert.deepEqual(names(applyLearnedColorOrder(colors, BASIC_TEE, null, { config })), names(colors));
  });

  it("is rebuilt once a day", () => {
    const ranking = buildLearnedRanking([], TODAY, config, "2026-11-21T10:00:00.000Z");
    assert.equal(rankingIsStale(ranking, new Date("2026-11-21T20:00:00Z"), config), false);
    assert.equal(rankingIsStale(ranking, new Date("2026-11-22T11:00:00Z"), config), true);
    assert.equal(rankingIsStale(null), true);
  });

  it("has Gabe's three as its pins", () => {
    assert.deepEqual(
      PINNED_COLOR_SLOTS.map((slot) => slot[0]),
      ["Black", "Navy", "Sport Grey"]
    );
  });
});

/** The blob store, as a Map. */
function memoryStore(clock: { now: number }) {
  const files = new Map<string, { body: string; uploadedAt: string }>();
  let counter = 0;
  const store: UsageBlobStore = {
    async write(pathname, body, { random }) {
      const path = random ? pathname.replace(/\.json$/, `-${(counter++).toString(36).padStart(6, "0")}.json`) : pathname;
      files.set(path, { body, uploadedAt: new Date(clock.now + counter).toISOString() });
    },
    async read(blob) {
      const path = typeof blob === "string" ? blob : blob.pathname;
      return files.get(path)?.body ?? null;
    },
    async list(prefix) {
      const found: StoredBlob[] = [];
      for (const [pathname, file] of files) {
        if (pathname.startsWith(prefix)) found.push({ pathname, url: pathname, uploadedAt: file.uploadedAt });
      }
      return found;
    },
    async remove(urls) {
      for (const url of urls) files.delete(url);
    },
  };
  return { store, files };
}

describe("the store", () => {
  beforeEach(() => resetRankingCache());

  it("keeps a preview's clicks out of the live counts", () => {
    assert.equal(usagePrefix("production"), "order-usage/");
    assert.equal(usagePrefix("preview"), "order-usage-preview/");
    assert.equal(usagePrefix(undefined), "order-usage-dev/");
  });

  it("keeps every visit, sums finished days once, and reads the same totals after", async () => {
    const clock = { now: Date.parse("2026-11-18T15:00:00Z") };
    const { store, files } = memoryStore(clock);

    for (let i = 0; i < 3; i++) {
      await recordVisit(store, [{ flow: "apparel", steps: ["product_chosen"], picks: [] }], new Date(clock.now));
    }
    await recordOrder(
      store,
      { quoteNumber: "GS-20261118-ABCD1234", lines: [{ style: BASIC_TEE, color: "Black", quantity: 24, sizes: {} }], placements: [] },
      new Date(clock.now)
    );

    const before = await loadUsageDays(store, "2026-11-18", "2026-11-18");
    assert.equal(before[0].funnel.apparel?.product_chosen, 3);
    assert.equal(before[0].orders.count, 1);

    // Too recent to roll up on the 19th; rolled up on the 21st.
    assert.deepEqual((await rollUpUsage(store, "2026-11-19")).summarised, []);
    assert.deepEqual((await rollUpUsage(store, TODAY)).summarised, ["2026-11-18"]);
    assert.deepEqual((await rollUpUsage(store, TODAY)).summarised, []);

    assert.equal([...files.keys()].filter((p) => p.includes("/raw/")).length, 0);
    assert.equal([...files.keys()].filter((p) => p.includes("/daily/")).length, 1);

    const after = await loadUsageDays(store, "2026-11-18", "2026-11-18");
    assert.deepEqual(after[0], before[0]);
  });

  it("writes the learned order where the catalogue reads it", async () => {
    const clock = { now: Date.parse("2026-11-21T15:00:00Z") };
    const { store } = memoryStore(clock);
    for (let i = 0; i < 15; i++) {
      await recordOrder(
        store,
        { quoteNumber: "", lines: [{ style: BASIC_TEE, color: "Lime", quantity: 24, sizes: {} }], placements: [] },
        new Date(clock.now)
      );
    }

    const built = await rebuildLearnedRanking(store, new Date(clock.now));
    assert.equal(built.styles[BASIC_TEE].ready, true);

    resetRankingCache();
    const read = await readLearnedRanking(store, clock.now);
    assert.deepEqual(read, built);
    assert.ok(await store.read(RANKING_PATH));
  });
});

describe("the weekly read", () => {
  it("lays the funnel beside the week before, with the share lost at each step", () => {
    const current: DailyUsage[] = [];
    const day = emptyDailyUsage(TODAY);
    for (let i = 0; i < 10; i++) addBeacon(day, { flow: "apparel", steps: ["product_chosen"], picks: [] });
    for (let i = 0; i < 6; i++) addBeacon(day, { flow: "apparel", steps: ["garment_chosen", "sizes_entered"], picks: [{ field: "color", style: BASIC_TEE, color: "Maroon" }] });
    for (let i = 0; i < 2; i++) addBeacon(day, { flow: "apparel", steps: ["art_uploaded", "quote_viewed", "submitted"], picks: [] });
    addOrder(day, { quoteNumber: "GS-20261121-ABCD1234", lines: [{ style: BASIC_TEE, color: "Maroon", quantity: 24, sizes: {} }], placements: ["Front"] });
    current.push(day);

    const report = buildUsageReport({ current, previous: [emptyDailyUsage("2026-11-14")], ranking: null });
    const steps = report.funnel.apparel;

    assert.deepEqual(steps.map((row) => [row.step, row.visits, row.lostFromPreviousStep]), [
      ["product_chosen", 10, null],
      ["garment_chosen", 6, 40],
      ["sizes_entered", 6, 0],
      ["art_uploaded", 2, 66.7],
      ["quote_viewed", 2, 0],
      ["submitted", 2, 0],
    ]);
    assert.match(report.headline.join(" "), /biggest drop is into "art_uploaded" \(66.7% lost\)/);
    assert.deepEqual(report.colorConversion, [
      { label: "Basic Tee · Maroon", picks: 6, quotes: 1, quotesPerPick: 0.17 },
    ]);
    assert.deepEqual(report.quoteNumbers, ["GS-20261121-ABCD1234"]);
    assert.equal(report.orders.placement[0].label, "Front");
  });

  it("says which garments are being re-sorted, and shows the top twelve as customers see them", () => {
    const ranking = buildLearnedRanking([dayWith(TODAY, BASIC_TEE, "Lime", 30)], TODAY);
    const report = buildUsageReport({
      current: [emptyDailyUsage(TODAY)],
      previous: [],
      ranking,
      catalogColors: { [BASIC_TEE]: fixture.styles[BASIC_TEE] },
    });
    const tee = report.learnedOrder.find((row) => row.style === BASIC_TEE)!;
    assert.equal(tee.ready, true);
    assert.deepEqual(tee.topNow?.slice(0, 3), ["Black", "Navy", "Sport Grey"]);
    assert.equal(tee.topNow?.length, 12);
    assert.match(report.headline.join(" "), /re-sorted from data on: Basic Tee/);
  });
});

describe("the browser side", () => {
  const nav = globalThis as unknown as {
    window?: unknown;
    document?: unknown;
    navigator?: unknown;
  };
  const saved = { window: nav.window, document: nav.document, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
  let posts: string[] = [];

  beforeEach(() => {
    resetUsageBeacon();
    posts = [];
    nav.window = { addEventListener() {} };
    nav.document = { addEventListener() {}, visibilityState: "visible" };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        sendBeacon(_url: string, body: Blob) {
          void body.text().then((text) => posts.push(text));
          return true;
        },
      },
    });
  });

  afterEach(() => {
    nav.window = saved.window;
    nav.document = saved.document;
    if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
    resetUsageBeacon();
  });

  it("sends each step and pick once per visit, however often it happens", async () => {
    recordUsageStep("apparel", "product_chosen");
    recordUsagePick("apparel", { field: "color", style: BASIC_TEE, color: "Navy" });
    recordUsagePick("apparel", { field: "color", style: BASIC_TEE, color: "Navy" });
    flushUsage();
    recordUsageStep("apparel", "product_chosen");
    recordUsagePick("apparel", { field: "color", style: BASIC_TEE, color: "Navy" });
    assert.deepEqual(pendingUsageForTest(), []);
    recordUsageStep("apparel", "submitted");
    flushUsage();

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(posts.length, 2);
    assert.deepEqual(JSON.parse(posts[0]), {
      beacons: [{ flow: "apparel", steps: ["product_chosen"], picks: [{ field: "color", style: BASIC_TEE, color: "Navy" }] }],
    });
    assert.deepEqual(JSON.parse(posts[1]).beacons[0].steps, ["submitted"]);
  });

  it("drops the scheduled health check's visit entirely", async () => {
    assert.equal(isTestIdentity("Scheduled-Test@gorillasalem.com"), true);
    assert.equal(isTestIdentity("", "SCHEDULED TEST — DO NOT FULFILL"), true);
    assert.equal(isTestIdentity("customer@example.com", "Jane"), false);

    recordUsageStep("stickers", "product_chosen");
    suppressUsage();
    recordUsageStep("stickers", "submitted");
    flushUsage();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(posts, []);
  });
});
