/**
 * THE CODES. Server-only — never import this from a client component.
 *
 * Two sources, merged, later wins on a duplicate:
 *
 *   1. BUILT_IN_CODES below — Gabe's "always working" list. Adding one is
 *      a one-line PR.
 *   2. The DISCOUNT_CODES environment variable — for codes invented between
 *      deploys. Comma-separated, CODE=VALUE, where VALUE is a percent
 *      ("10%") or the word "shipping":
 *
 *        DISCOUNT_CODES="SALEM10=10%,FRIENDS=15%,FREESHIP=shipping"
 *
 *      Set it in Vercel → Settings → Environment Variables → Production,
 *      then redeploy (env changes need one). A malformed entry is skipped
 *      and logged once, never thrown — a typo in a code must not take the
 *      quote form down.
 *
 * Only percent-off-stickers and free-shipping codes exist. A flat "$5 off"
 * needs either a negative Printavo line (unverified) or splitting dollars
 * across four-decimal unit prices (never lands on the exact figure), so it
 * waits for a Printavo probe.
 */

import { normalizeDiscountCode, type Discount } from "./discount";

export const BUILT_IN_CODES: readonly Discount[] = [
  // { code: "SALEM10", kind: "percent", percent: 10 },
  // { code: "FREESHIP", kind: "shipping" },
];

/** Parse "CODE=10%,CODE2=shipping". Bad entries are dropped, not thrown. */
export function parseDiscountCodes(raw: string | undefined, warn: (line: string) => void = () => {}): Discount[] {
  const out: Discount[] = [];
  for (const entry of String(raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const code = normalizeDiscountCode(eq === -1 ? trimmed : trimmed.slice(0, eq));
    const value = eq === -1 ? "" : trimmed.slice(eq + 1).trim().toLowerCase();
    if (!code) {
      warn(`DISCOUNT_CODES: entry "${trimmed}" has no code — skipped`);
      continue;
    }
    if (value === "shipping") {
      out.push({ code, kind: "shipping" });
      continue;
    }
    const pct = /^(\d+(?:\.\d+)?)%$/.exec(value);
    const percent = pct ? Number(pct[1]) : Number.NaN;
    if (Number.isFinite(percent) && percent > 0 && percent <= 100) {
      out.push({ code, kind: "percent", percent });
      continue;
    }
    warn(`DISCOUNT_CODES: "${trimmed}" is not CODE=NN% or CODE=shipping — skipped`);
  }
  return out;
}

let warned = false;

/** Built-in plus env, env winning on a duplicate code. */
export function allDiscountCodes(env: Record<string, string | undefined> = process.env): Discount[] {
  const fromEnv = parseDiscountCodes(env.DISCOUNT_CODES, (line) => {
    if (!warned) console.warn(line);
    warned = true;
  });
  const byCode = new Map<string, Discount>();
  for (const d of [...BUILT_IN_CODES, ...fromEnv]) byCode.set(normalizeDiscountCode(d.code), { ...d, code: normalizeDiscountCode(d.code) });
  return [...byCode.values()];
}

/** The discount for a code, or null. Case- and space-insensitive. */
export function findDiscountCode(raw: unknown, codes: readonly Discount[] = allDiscountCodes()): Discount | null {
  const code = normalizeDiscountCode(raw);
  if (!code) return null;
  return codes.find((d) => normalizeDiscountCode(d.code) === code) ?? null;
}

export function isDiscountConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return allDiscountCodes(env).length > 0;
}
