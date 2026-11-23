import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

import {
  SEASONS,
  resolveTheme,
  seasonFor,
  seasonThemeScript,
  shopMonthDay,
} from "../lib/season";

/**
 * Seasonal colours (Gabe, 2026-11-23): Thanksgiving through November,
 * Christmas from 1 December, house colours back on 1 January.
 *
 * Every date here is passed in explicitly. Nothing reads the real clock, so
 * these mean the same thing on any day they run (AGENTS.md: never pin a
 * fixture to a date that has to still be in the future).
 */

describe("which season a shop-clock day falls in", () => {
  const cases: Array<[string, string | null]> = [
    ["10-31", null],
    ["11-01", "thanksgiving"],
    ["11-23", "thanksgiving"],
    ["11-30", "thanksgiving"],
    ["12-01", "christmas"],
    ["12-25", "christmas"],
    ["12-31", "christmas"],
    ["01-01", null],
    ["07-04", null],
  ];
  for (const [md, want] of cases) {
    it(`${md} → ${want ?? "house colours"}`, () => {
      assert.equal(seasonFor(md), want);
    });
  }
});

describe("the switch happens at midnight in Salem, not UTC", () => {
  it("11:30 PM on 30 Nov in Salem is still Thanksgiving (04:30 UTC on 1 Dec)", () => {
    const md = shopMonthDay(new Date("2026-12-01T04:30:00Z"));
    assert.equal(md, "11-30");
    assert.equal(seasonFor(md), "thanksgiving");
  });
  it("12:05 AM on 1 Dec in Salem is Christmas", () => {
    const md = shopMonthDay(new Date("2026-12-01T05:05:00Z"));
    assert.equal(md, "12-01");
    assert.equal(seasonFor(md), "christmas");
  });
  it("New Year's Eve evening in Salem is still Christmas; 1 Jan is not", () => {
    assert.equal(seasonFor(shopMonthDay(new Date("2027-01-01T03:00:00Z"))), "christmas");
    assert.equal(seasonFor(shopMonthDay(new Date("2027-01-01T06:00:00Z"))), null);
  });
});

describe("?theme= previews", () => {
  it("a season name wins over the calendar", () => {
    assert.equal(resolveTheme("christmas", "11-23"), "christmas");
    assert.equal(resolveTheme("thanksgiving", "07-04"), "thanksgiving");
  });
  it("default shows the house colours even in season", () => {
    assert.equal(resolveTheme("default", "12-10"), null);
  });
  it("anything else is ignored and the calendar decides", () => {
    for (const junk of [null, undefined, "", "CHRISTMAS", "halloween", "<x>"]) {
      assert.equal(resolveTheme(junk, "12-10"), "christmas");
      assert.equal(resolveTheme(junk, "03-01"), null);
    }
  });
});

describe("the <head> script agrees with resolveTheme()", () => {
  // Run the real inline script against a fake document and a frozen clock,
  // so the ES5 copy of the rules cannot drift from the TypeScript ones.
  function runScript(search: string, iso: string): string | null {
    let set: string | null = null;
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(iso);
        else super(...(args as [string]));
      }
    }
    runInNewContext(seasonThemeScript(), {
      URLSearchParams,
      Intl,
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

  const instants = [
    "2026-10-31T15:00:00Z",
    "2026-11-23T18:00:00Z",
    "2026-12-01T04:30:00Z",
    "2026-12-01T05:05:00Z",
    "2026-12-25T12:00:00Z",
    "2027-01-01T03:00:00Z",
    "2027-01-01T06:00:00Z",
    "2027-06-15T12:00:00Z",
  ];
  const searches = ["", "?theme=christmas", "?theme=thanksgiving", "?theme=default", "?theme=nope", "?step=2&theme=christmas"];

  for (const iso of instants) {
    for (const search of searches) {
      it(`${iso} ${search || "(no param)"}`, () => {
        const param = new URLSearchParams(search).get("theme");
        const want = resolveTheme(param, shopMonthDay(new Date(iso)));
        assert.equal(runScript(search, iso), want);
      });
    }
  }

  it("fails closed: a broken environment leaves the house colours", () => {
    assert.doesNotThrow(() =>
      runInNewContext(seasonThemeScript(), { location: { search: "" } })
    );
  });
});

/* ---- Every season clears the same contrast floors as the house inks ---- */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function block(selector: string) {
  const start = css.indexOf(selector + " {");
  assert.ok(start >= 0, `${selector} not found in globals.css`);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(text: string) {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

const house = tokens(block(":root"));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const season of SEASONS) {
  describe(`${season.id} inks`, () => {
    const t = { ...house, ...tokens(block(`html[data-theme="${season.id}"]`)) };
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
    it("the badge's type on its fill ≥ 4.5:1", () => {
      const fill = t["badge-fill"];
      assert.ok(fill, "a season sets its own --badge-fill");
      assert.ok(contrast(t.paper, fill) >= 4.5);
    });
    it("leaves the alarm ink and the cut line alone", () => {
      const own = tokens(block(`html[data-theme="${season.id}"]`));
      assert.equal(own["rush-red"], undefined);
      assert.equal(own["cut-line"], undefined);
    });
  });
}

describe("Christmas decor stays out of the way", () => {
  it("is hidden by default and shown only under the Christmas theme", () => {
    assert.match(css, /\.xmas-decor,\s*\.xmas-snow\s*\{\s*display:\s*none;/);
    assert.match(css, /html\[data-theme="christmas"\] \.xmas-decor\s*\{\s*display:\s*block;/);
    assert.match(css, /html\[data-theme="christmas"\] \.xmas-snow\s*\{[^}]*z-index:\s*-1;/);
  });
  it("only falls for visitors who have not asked for less motion", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    assert.ok(start >= 0);
    const before = css.slice(0, start);
    assert.doesNotMatch(before.slice(before.indexOf(".xmas-flake {")), /animation-name:\s*snowfall/);
  });
  it("never takes a click", () => {
    const src = readFileSync(new URL("../components/SeasonDecor.tsx", import.meta.url), "utf8");
    assert.equal((src.match(/pointer-events-none/g) ?? []).length, 5);
    assert.equal((src.match(/aria-hidden="true"/g) ?? []).length, 5);
  });
});

describe("Thanksgiving leaves stay out of the way", () => {
  it("are hidden by default and shown only under the Thanksgiving theme, behind the page", () => {
    assert.match(css, /\.fall-leaves\s*\{\s*display:\s*none;/);
    assert.match(css, /html\[data-theme="thanksgiving"\] \.fall-leaves\s*\{[^}]*display:\s*block;[^}]*z-index:\s*-1;/);
  });
  it("only fall and sway for visitors who have not asked for less motion", () => {
    const start = css.indexOf(".fall-leaf {");
    const motion = css.indexOf("@media (prefers-reduced-motion: no-preference)", start);
    assert.ok(start >= 0 && motion > start);
    assert.doesNotMatch(css.slice(start, motion), /animation-name/);
  });
});
