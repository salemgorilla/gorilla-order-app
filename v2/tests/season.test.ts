import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

import {
  DRIFT_MAX,
  THEME_IDS,
  checkCalendar,
  dayOf,
  easterDay,
  parseDay,
  resolveTheme,
  seasonThemeScript,
  shopDate,
  themeFor,
  themeStylesheet,
  type ShopDate,
} from "../lib/season";
import { THEME_CALENDAR } from "../lib/theme-calendar";

/**
 * The theme calendar (Gabe, 2026-11-23): Thanksgiving through November and
 * Christmas through December (PR 227), then "a schedule to change the theme
 * for seasons and holiday/special days".
 *
 * Every date here is passed in explicitly. Nothing reads the real clock, so
 * these mean the same thing on any day they run (AGENTS.md: never pin a
 * fixture to a date that has to still be in the future).
 */

const day = (iso: string): ShopDate => {
  const [year, month, d] = iso.split("-").map(Number);
  return { year, month, day: d };
};
const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

describe("the calendar file itself", () => {
  it("has no typos a build would trip on", () => {
    assert.doesNotThrow(() => checkCalendar());
    assert.doesNotThrow(() => themeStylesheet());
  });
  it("reads the four ways a day can be written", () => {
    assert.deepEqual(parseDay("02-14"), [0, 2, 14, 0, 0]);
    assert.deepEqual(parseDay("easter"), [1, 0, 0, 0, 0]);
    assert.deepEqual(parseDay("easter -6"), [1, 0, 0, 0, -6]);
    assert.deepEqual(parseDay("2nd sun of may"), [2, 5, 0, 2, 0]);
    assert.deepEqual(parseDay("3rd Sunday of June -6"), [2, 6, 0, 3, -6]);
    assert.deepEqual(parseDay("last mon of may +1"), [2, 5, 1, -1, 1]);
  });
  it("refuses a day it can't read rather than guessing", () => {
    for (const bad of ["2/14", "02-30", "02-29", "13-01", "easterr", "2nd sun may", "6th sun of may", "12-25-1"]) {
      assert.throws(() => parseDay(bad), Error, bad);
    }
  });
});

describe("computed days land where a calendar says", () => {
  it("Easter", () => {
    const known: Record<number, string> = {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
      2035: "2035-03-25",
      2038: "2038-04-25",
    };
    for (const [y, iso] of Object.entries(known)) assert.equal(isoOf(easterDay(Number(y))), iso);
  });
  it("Mother's Day, Father's Day, Memorial Day, Thanksgiving", () => {
    assert.equal(isoOf(dayOf(parseDay("2nd sun of may"), 2027)), "2027-05-09");
    assert.equal(isoOf(dayOf(parseDay("2nd sun of may"), 2028)), "2028-05-14");
    assert.equal(isoOf(dayOf(parseDay("3rd sun of jun"), 2027)), "2027-06-20");
    assert.equal(isoOf(dayOf(parseDay("3rd sun of jun"), 2026)), "2026-06-21");
    assert.equal(isoOf(dayOf(parseDay("last mon of may"), 2027)), "2027-05-31");
    assert.equal(isoOf(dayOf(parseDay("4th thu of nov"), 2026)), "2026-11-26");
  });
});

describe("which theme a shop-clock day gets", () => {
  const cases: Array<[string, string | null]> = [
    // PR 227's two, unchanged.
    ["2026-11-01", "thanksgiving"],
    ["2026-11-23", "thanksgiving"],
    ["2026-11-30", "thanksgiving"],
    ["2026-12-01", "christmas"],
    ["2026-12-25", "christmas"],
    ["2026-12-31", "christmas"],
    // Holidays.
    ["2027-01-01", "new-year"],
    ["2027-01-03", "new-year"],
    ["2027-02-06", "winter"],
    ["2027-02-07", "valentines"],
    ["2027-02-14", "valentines"],
    ["2027-02-15", "winter"],
    ["2027-03-17", "st-patricks"],
    ["2027-03-18", "winter"],
    ["2027-03-21", "spring"],
    ["2027-03-22", "easter"], // Easter 2027 is 28 March
    ["2027-03-28", "easter"],
    ["2027-03-29", "spring"],
    ["2027-05-03", "mothers-day"],
    ["2027-05-09", "mothers-day"],
    ["2027-05-10", "spring"],
    ["2027-06-14", "fathers-day"],
    ["2027-06-20", "fathers-day"],
    ["2027-06-21", "summer"],
    ["2027-07-04", "july-4"],
    ["2027-07-06", "summer"],
    ["2027-09-22", "fall"],
    ["2027-10-01", "october"],
    ["2027-10-24", "october"],
    ["2027-10-25", "halloween"],
    ["2027-10-31", "halloween"],
    ["2027-11-01", "thanksgiving"],
    // Seasons, between holidays.
    ["2027-01-04", "winter"],
    ["2027-03-19", "winter"],
    ["2027-03-20", "spring"],
    ["2027-08-15", "summer"],
    ["2027-09-21", "summer"],
    ["2027-09-30", "fall"],
  ];
  for (const [iso, want] of cases) {
    it(`${iso} → ${want ?? "house colours"}`, () => {
      assert.equal(themeFor(day(iso)), want);
    });
  }

  it("St. Patrick's wins where an early Easter week would overlap it", () => {
    // Easter 2008 was 23 March, so its week began on the 17th.
    assert.equal(themeFor(day("2008-03-17")), "st-patricks");
    assert.equal(themeFor(day("2008-03-18")), "easter");
  });
});

describe("the switch happens at midnight in Salem, not UTC", () => {
  it("11:30 PM on 30 Nov in Salem is still Thanksgiving (04:30 UTC on 1 Dec)", () => {
    const d = shopDate(new Date("2026-12-01T04:30:00Z"));
    assert.deepEqual(d, { year: 2026, month: 11, day: 30 });
    assert.equal(themeFor(d), "thanksgiving");
  });
  it("12:05 AM on 1 Dec in Salem is Christmas", () => {
    assert.equal(themeFor(shopDate(new Date("2026-12-01T05:05:00Z"))), "christmas");
  });
  it("New Year's Eve evening in Salem is still Christmas; 1 Jan is New Year's", () => {
    assert.equal(themeFor(shopDate(new Date("2027-01-01T03:00:00Z"))), "christmas");
    assert.equal(themeFor(shopDate(new Date("2027-01-01T06:00:00Z"))), "new-year");
  });
});

describe("?theme= previews", () => {
  it("every theme can be previewed, on or off", () => {
    for (const t of THEME_CALENDAR) assert.equal(resolveTheme(t.id, day("2027-08-01")), t.id);
  });
  it("default shows the house colours even on a holiday", () => {
    assert.equal(resolveTheme("default", day("2026-12-10")), null);
  });
  it("anything else is ignored and the calendar decides", () => {
    for (const junk of [null, undefined, "", "CHRISTMAS", "xmas", "<x>", "constructor"]) {
      assert.equal(resolveTheme(junk, day("2026-12-10")), "christmas");
      assert.equal(resolveTheme(junk, day("2027-08-01")), "summer");
    }
  });
});

describe("the <head> script agrees with resolveTheme()", () => {
  // Run the real inline script against a fake document and a frozen clock,
  // so the ES5 copy of the rules cannot drift from the TypeScript ones.
  const script = seasonThemeScript();
  function runScript(search: string, iso: string): string | null {
    let set: string | null = null;
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(iso);
        else super(...(args as [string]));
      }
    }
    runInNewContext(script, {
      URLSearchParams,
      Intl,
      Math,
      Date: FrozenDate,
      location: { search },
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) => {
            assert.equal(name, "data-theme");
            set = value;
          },
        },
      },
    });
    return set;
  }

  it("on every day from 2026 to 2036, at noon in Salem", () => {
    const start = Date.UTC(2026, 0, 1) / 86400000;
    const end = Date.UTC(2036, 11, 31) / 86400000;
    for (let n = start; n <= end; n++) {
      const iso = `${isoOf(n)}T17:00:00Z`;
      const want = resolveTheme(null, shopDate(new Date(iso)));
      assert.equal(runScript("", iso), want, iso);
    }
  });

  const instants = [
    "2026-11-23T18:00:00Z",
    "2026-12-01T04:30:00Z",
    "2026-12-01T05:05:00Z",
    "2027-01-01T03:00:00Z",
    "2027-01-01T06:00:00Z",
    "2027-03-28T12:00:00Z",
  ];
  const searches = ["?theme=christmas", "?theme=halloween", "?theme=default", "?theme=nope", "?step=2&theme=easter"];
  for (const iso of instants) {
    for (const search of searches) {
      it(`${iso} ${search}`, () => {
        const param = new URLSearchParams(search).get("theme");
        assert.equal(runScript(search, iso), resolveTheme(param, shopDate(new Date(iso))));
      });
    }
  }

  it("fails closed: a broken environment leaves the house colours", () => {
    assert.doesNotThrow(() => runInNewContext(script, { location: { search: "" } }));
  });
});

/* ---- Every theme clears the same contrast floors as the house inks ---- */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function houseTokens() {
  const start = css.indexOf(":root {");
  const text = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const house = houseTokens();

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const theme of THEME_CALENDAR) {
  describe(`${theme.id} inks`, () => {
    const t: Record<string, string> = {
      ...house,
      "badge-fill": house["gorilla-green"],
      ...(theme.colors as Record<string, string>),
    };
    const text: Array<[string, string]> = [
      ["ink-black", "paper"],
      ["ink-black", "shirt-blank"],
      ["ink-muted", "paper"],
      ["ink-muted", "shirt-blank"],
      ["ink-muted", "surface-ok"],
      ["rush-red", "paper"],
      ["rush-red", "shirt-blank"],
      // The accent is text (prices, links) AND a fill under white type.
      ["gorilla-green", "paper"],
      ["gorilla-green", "shirt-blank"],
      ["gorilla-green", "surface-ok"],
      ["paper", "gorilla-green"],
      ["paper", "gorilla-green-dark"],
      ["green-bright", "ink-black"],
      ["ink-warn", "surface-warn"],
      ["paper", "badge-fill"],
    ];
    for (const [ink, ground] of text) {
      it(`--${ink} on --${ground} ≥ 4.5:1`, () => {
        const r = contrast(t[ink], t[ground]);
        assert.ok(r >= 4.5, `${t[ink]} on ${t[ground]}: ${r.toFixed(2)}:1`);
      });
    }
    for (const ground of ["paper", "shirt-blank"]) {
      it(`--rule on --${ground} ≥ 3:1`, () => {
        const r = contrast(t.rule, t[ground]);
        assert.ok(r >= 3, `${t.rule} on ${t[ground]}: ${r.toFixed(2)}:1`);
      });
    }
    it("leaves the alarm ink and the cut line alone", () => {
      const own = theme.colors as Record<string, string>;
      assert.equal(own["rush-red"], undefined);
      assert.equal(own["cut-line"], undefined);
    });
  });
}

describe("PR 227's two themes are unchanged", () => {
  const sheet = themeStylesheet();
  it("Thanksgiving", () => {
    assert.match(
      sheet,
      /html\[data-theme="thanksgiving"\]\{--ink-black:#22160d;--ink-muted:#5c4632;--shirt-blank:#f8eedd;--rule:#8f7660;--rule-faint:#e3d3bb;--gorilla-green:#9a4b00;--gorilla-green-dark:#733700;--green-bright:#e2a72e;--surface-ok:#f6e6d2;--badge-fill:#8a1f2d;--season-band:repeating-linear-gradient\(90deg,#9a4b00 0 2rem,#e2a72e 2rem 4rem,#8a1f2d 4rem 6rem,#5c4632 6rem 8rem\)\}/
    );
  });
  it("Christmas", () => {
    assert.match(
      sheet,
      /html\[data-theme="christmas"\]\{--ink-muted:#5a5448;--shirt-blank:#fbf7ef;--rule:#8a8270;--rule-faint:#e4ddcd;--gorilla-green:#1d5c34;--gorilla-green-dark:#123f22;--green-bright:#d6ac3a;--surface-ok:#e6f0e7;--badge-fill:#a11a2e;--season-band:repeating-linear-gradient\(-45deg,#a11a2e 0 0\.75rem,#fbf7ef 0\.75rem 1\.5rem,#1d5c34 1\.5rem 2\.25rem,#fbf7ef 2\.25rem 3rem\)\}/
    );
  });
});

describe("decor stays out of the way", () => {
  const sheet = themeStylesheet();
  it("every spot is hidden until a theme shows it", () => {
    assert.match(css, /\.decor-header,\s*\.decor-corner,\s*\.decor-drift\s*\{\s*display:\s*none;\s*pointer-events:\s*none;/);
    assert.match(css, /html\[data-theme\] \.decor-drift\s*\{[^}]*z-index:\s*-1;/);
  });
  it("only moves for visitors who have not asked for less motion", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    assert.ok(start >= 0);
    assert.doesNotMatch(css.slice(0, start), /animation-name:/);
    // A theme's own animation rule is inside the same media query.
    for (const line of sheet.split("\n")) {
      if (/animation-name/.test(line)) assert.match(line, /^@media \(prefers-reduced-motion: no-preference\)\{/);
    }
  });
  it("never takes a tap and is hidden from screen readers", () => {
    const src = readFileSync(new URL("../components/SeasonDecor.tsx", import.meta.url), "utf8");
    assert.equal((src.match(/pointer-events-none/g) ?? []).length, 3);
    assert.equal((src.match(/aria-hidden="true"/g) ?? []).length, 3);
  });
  it("carries as many drift spans as the calendar may ask for", () => {
    const src = readFileSync(new URL("../components/SeasonDecor.tsx", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("const FLAKES"), src.indexOf("];", src.indexOf("const FLAKES")));
    assert.equal((block.match(/\{ x: \d/g) ?? []).length, DRIFT_MAX);
  });
  it("stays light: the whole stylesheet is small", () => {
    assert.ok(sheet.length < 60_000, `${sheet.length} bytes`);
  });
  it("every id is usable in a URL and in a CSS selector", () => {
    for (const id of THEME_IDS) assert.match(id, /^[a-z0-9-]+$/);
  });
});
