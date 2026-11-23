/**
 * The engine behind lib/theme-calendar.ts. Edit dates, colours and decor
 * THERE; this file only reads the calendar and applies it.
 *
 * Gabe, 2026-11-23: first "fall Thanksgiving colors" and Christmas from
 * 1 December (PR 227), then "Can we set up a schedule to change the theme
 * for seasons and holiday/special days?"
 *
 * WHAT A THEME DOES. It only recolours and decorates. Every ink it touches
 * is a token in app/globals.css; themeStylesheet() below writes one
 * `html[data-theme="<id>"] { --token: … }` block per theme, plus the rules
 * that show that theme's decor. Outside every theme the attribute is absent
 * and the house Order Desk inks apply exactly as before.
 *
 * WHY THE CHOICE IS MADE IN THE BROWSER. The page is statically rendered at
 * build time, so a theme picked on the server would be frozen to the day of
 * the last deploy and Christmas would never arrive on its own. A few lines
 * run in <head> before first paint instead (seasonThemeScript below), so
 * there is no flash of the wrong colours and no deploy on any holiday.
 * tests/season.test.ts runs that script against resolveTheme() for every
 * day of eleven years so the two cannot drift.
 */

import { DECOR, decorUrl } from "./theme-decor";
import { THEME_CALENDAR, type ThemeEntry } from "./theme-calendar";

/** `?theme=` values: a theme id, or "default" to see the house colours. */
export const THEME_PARAM = "theme";
export const DEFAULT_THEME = "default";

export const SHOP_TIME_ZONE = "America/New_York";

/* ---------------------------- Day rules ---------------------------- */

/**
 * A day rule, compiled: [kind, month, a, b, offsetDays].
 *   kind 0  fixed day:        month, a = day
 *   kind 1  Easter Sunday
 *   kind 2  nth weekday:      month, a = weekday (0 = Sunday), b = n (-1 = last)
 */
export type DayRule = [0 | 1 | 2, number, number, number, number];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const NTH: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, last: -1 };

/** Reads a day as written in the calendar. Throws on anything it can't. */
export function parseDay(text: string): DayRule {
  const raw = text.trim().toLowerCase();
  const withOffset = /^(.*?)\s+([+-]\s*\d{1,3})$/.exec(raw);
  const base = withOffset ? withOffset[1].trim() : raw;
  const offset = withOffset ? Number(withOffset[2].replace(/\s/g, "")) : 0;

  const fixed = /^(\d{2})-(\d{2})$/.exec(base);
  if (fixed) {
    const month = Number(fixed[1]);
    const day = Number(fixed[2]);
    const longest = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!longest || day < 1 || day > longest) {
      throw new Error(`theme calendar: "${text}" is not a day every year has`);
    }
    return [0, month, day, 0, offset];
  }
  if (base === "easter") return [1, 0, 0, 0, offset];

  const nth = /^(1st|2nd|3rd|4th|5th|last)\s+([a-z]{3})[a-z]*\s+of\s+([a-z]{3})[a-z]*$/.exec(base);
  if (nth && WEEKDAYS.includes(nth[2]) && MONTHS.includes(nth[3])) {
    return [2, MONTHS.indexOf(nth[3]) + 1, WEEKDAYS.indexOf(nth[2]), NTH[nth[1]], offset];
  }
  throw new Error(
    `theme calendar: can't read the day "${text}". Use "MM-DD", "easter", "easter -6", or "2nd sun of may".`
  );
}

const DAY_MS = 86400000;
const dayNumber = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / DAY_MS;

/** Easter Sunday (Gregorian, the anonymous algorithm) as a day number. */
export function easterDay(y: number): number {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const s = h + l - 7 * m + 114;
  return dayNumber(y, Math.floor(s / 31), (s % 31) + 1);
}

/** Where a rule lands in a given year, as a day number. */
export function dayOf(rule: DayRule, year: number): number {
  const [kind, month, a, b, offset] = rule;
  let day: number;
  if (kind === 0) {
    day = dayNumber(year, month, a);
  } else if (kind === 1) {
    day = easterDay(year);
  } else if (b > 0) {
    const first = dayNumber(year, month, 1);
    // 1 Jan 1970 was a Thursday (4).
    day = first + ((a - ((first + 4) % 7) + 7) % 7) + (b - 1) * 7;
  } else {
    const last = dayNumber(year, month + 1, 0);
    day = last - ((((last + 4) % 7) - a + 7) % 7);
  }
  return day + offset;
}

/* ----------------------------- Calendar ---------------------------- */

interface Compiled {
  id: string;
  from: DayRule;
  to: DayRule;
}

/** The themes that are on, in the order they are tried: holidays first. */
function compiled(): Compiled[] {
  const pick = (kind: ThemeEntry["kind"]) =>
    THEME_CALENDAR.filter((t) => t.on && t.kind === kind).map((t) => ({
      id: t.id,
      from: parseDay(t.from),
      to: parseDay(t.to),
    }));
  return [...pick("holiday"), ...pick("season")];
}

/** Does `today` (a day number) fall in the range, this year's or last? */
function inRange(from: DayRule, to: DayRule, today: number, year: number): boolean {
  for (let y = year - 1; y <= year; y++) {
    const start = dayOf(from, y);
    let end = dayOf(to, y);
    if (end < start) end = dayOf(to, y + 1); // crosses New Year
    if (today >= start && today <= end) return true;
  }
  return false;
}

export interface ShopDate {
  year: number;
  month: number;
  day: number;
}

/** Today on the shop's clock (midnight in Salem, not UTC). */
export function shopDate(now: Date = new Date()): ShopDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "1");
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** The calendar's theme for a shop-clock day, or null for the house colours. */
export function themeFor(date: ShopDate): string | null {
  const today = dayNumber(date.year, date.month, date.day);
  for (const t of compiled()) {
    if (inRange(t.from, t.to, today, date.year)) return t.id;
  }
  return null;
}

/** Every id ?theme= accepts, including themes that are switched off. */
export const THEME_IDS: readonly string[] = THEME_CALENDAR.map((t) => t.id);

/**
 * The theme to show: a valid `?theme=` preview wins, then the calendar.
 * Anything unrecognised in the param is ignored rather than trusted.
 */
export function resolveTheme(param: string | null | undefined, date: ShopDate): string | null {
  if (param === DEFAULT_THEME) return null;
  if (param && THEME_IDS.includes(param)) return param;
  return themeFor(date);
}

/**
 * The inline <head> script. Same rules as resolveTheme(), written out in
 * plain ES5 because it runs before any bundle. Fails closed: any error
 * leaves the house colours.
 */
export function seasonThemeScript(): string {
  const table = JSON.stringify(compiled().map((t) => [t.id, t.from, t.to]));
  return (
    "(function(){try{" +
    `var S=${table},P=${JSON.stringify(THEME_IDS)},D=${JSON.stringify(DEFAULT_THEME)};` +
    `var q=new URLSearchParams(location.search).get(${JSON.stringify(THEME_PARAM)});` +
    `var p=new Intl.DateTimeFormat("en-US",{timeZone:${JSON.stringify(SHOP_TIME_ZONE)},year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());` +
    "var Y=1970,M=1,N=1;for(var i=0;i<p.length;i++){var v=+p[i].value;if(p[i].type==='year')Y=v;if(p[i].type==='month')M=v;if(p[i].type==='day')N=v;}" +
    "function u(y,m,d){return Date.UTC(y,m-1,d)/864e5;}" +
    "function e(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),f=b%4,g=Math.floor((b+8)/25),h=Math.floor((b-g+1)/3),j=(19*a+b-d-h+15)%30,k=Math.floor(c/4),l=c%4,o=(32+2*f+2*k-j-l)%7,r=Math.floor((a+11*j+22*o)/451),s=j+o-7*r+114;return u(y,Math.floor(s/31),s%31+1);}" +
    "function w(R,y){var x;if(R[0]===0)x=u(y,R[1],R[2]);else if(R[0]===1)x=e(y);else if(R[3]>0){var f=u(y,R[1],1);x=f+(R[2]-(f+4)%7+7)%7+(R[3]-1)*7;}else{var z=u(y,R[1]+1,0);x=z-(((z+4)%7)-R[2]+7)%7;}return x+R[4];}" +
    "var T=u(Y,M,N),t=null;" +
    "if(q!==D){for(var n=0;n<P.length;n++){if(P[n]===q){t=q;break;}}" +
    "if(!t){for(var m=0;m<S.length&&!t;m++){for(var y=Y-1;y<=Y;y++){var a=w(S[m][1],y),b=w(S[m][2],y);if(b<a)b=w(S[m][2],y+1);if(T>=a&&T<=b){t=S[m][0];break;}}}}}" +
    'if(t)document.documentElement.setAttribute("data-theme",t);' +
    "}catch(x){}})();"
  );
}

/* ---------------------------- Stylesheet --------------------------- */

const HEX = /^#[0-9a-f]{6}$/i;

/** How many drift spans the page carries (components/SeasonDecor.tsx). */
export const DRIFT_MAX = 12;

/** Throws on the first mistake in the calendar, so the build fails, not the site. */
export function checkCalendar(): void {
  const seen = new Set<string>();
  for (const t of THEME_CALENDAR) {
    const where = `theme calendar, "${t.id}"`;
    if (!/^[a-z0-9-]+$/.test(t.id) || t.id === DEFAULT_THEME) throw new Error(`${where}: bad id`);
    if (seen.has(t.id)) throw new Error(`${where}: id used twice`);
    seen.add(t.id);
    if (t.kind !== "holiday" && t.kind !== "season") throw new Error(`${where}: kind`);
    parseDay(t.from);
    parseDay(t.to);
    for (const [token, value] of Object.entries(t.colors)) {
      if (!HEX.test(value ?? "")) throw new Error(`${where}: --${token} must be #rrggbb`);
    }
    for (const c of t.stripe?.colors ?? []) if (!HEX.test(c)) throw new Error(`${where}: stripe colour ${c}`);
    if (t.stripe && !/^\d+(\.\d+)?rem$/.test(t.stripe.band)) throw new Error(`${where}: stripe band`);
    const d = t.decor ?? {};
    for (const name of [d.header, d.corner, ...(d.drift?.shapes ?? [])]) {
      if (name !== undefined && !DECOR[name]) throw new Error(`${where}: no decor called "${name}"`);
    }
    if (d.drift) {
      const { shapes, count } = d.drift;
      if (shapes.length < 1 || shapes.length > 3) throw new Error(`${where}: drift takes 1 to 3 shapes`);
      if (!Number.isInteger(count) || count < 1 || count > DRIFT_MAX) {
        throw new Error(`${where}: drift count must be 1 to ${DRIFT_MAX}`);
      }
    }
  }
}

function stripeCss(stripe: NonNullable<ThemeEntry["stripe"]>): string {
  const band = parseFloat(stripe.band);
  const at = (n: number) => (n === 0 ? "0" : `${Number((band * n).toFixed(4))}rem`);
  const stops = stripe.colors.map((c, i) => `${c} ${at(i)} ${at(i + 1)}`).join(",");
  return `repeating-linear-gradient(${stripe.angle}deg,${stops})`;
}

/**
 * Every theme's colours and decor rules, written once at build time into a
 * <style> in the page head (app/layout.tsx). Only the theme named on
 * <html data-theme> matches, so a browser draws one theme's decor at most.
 */
export function themeStylesheet(): string {
  checkCalendar();
  const out: string[] = [];
  for (const t of THEME_CALENDAR) {
    const sel = `html[data-theme="${t.id}"]`;
    const vars = Object.entries(t.colors).map(([k, v]) => `--${k}:${v}`);
    if (t.stripe) vars.push(`--season-band:${stripeCss(t.stripe)}`);
    out.push(`${sel}{${vars.join(";")}}`);

    const d = t.decor ?? {};
    if (d.header) out.push(`${sel} .decor-header{display:inline-block;background-image:${decorUrl(d.header)}}`);
    if (d.corner) out.push(`${sel} .decor-corner{display:block;background-image:${decorUrl(d.corner)}}`);
    if (d.drift) {
      const k = d.drift.shapes.length;
      out.push(`${sel} .decor-drift{display:block}`);
      d.drift.shapes.forEach((shape, i) => {
        const nth = k === 1 ? "" : `:nth-child(${k}n+${i + 1})`;
        out.push(`${sel} .decor-drift>span${nth}{background-image:${decorUrl(shape)}}`);
      });
      if (d.drift.count < DRIFT_MAX) {
        out.push(`${sel} .decor-drift>span:nth-child(n+${d.drift.count + 1}){display:none}`);
      }
      if (d.drift.direction === "up") {
        out.push(
          `@media (prefers-reduced-motion: no-preference){${sel} .decor-drift>span{top:100%;animation-name:drift-up}}`
        );
      }
    }
  }
  return out.join("\n");
}
