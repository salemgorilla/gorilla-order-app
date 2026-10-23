/**
 * The copied quote text must state the setup fee the shop actually charges.
 *
 * Found 2026-10-23 while adding paper printing: the sticker branch of the
 * customer's copy-to-clipboard record said "Setup: $22.50 ($25 first design +
 * $12.50 x 1)" for a two-design order, while the real fee is $15 for the first
 * design and $7.50 for each after (STICKER_SETUP_FEE and
 * STICKER_SETUP_FEE_ADDITIONAL in lib/pricing.ts, the same constants the order
 * summary reads). The customer keeps and forwards this text, so it was
 * stating a price breakdown the invoice does not carry.
 *
 * Asserted against the source because this repo has no React renderer and the
 * text is built inside the page component; the point is that the numbers are
 * READ from the constants and never typed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { STICKER_SETUP_FEE, STICKER_SETUP_FEE_ADDITIONAL } from "../lib/pricing";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("the copied sticker record reads its setup breakdown from the constants", () => {
  assert.match(
    page,
    /\(\$\$\{STICKER_SETUP_FEE\} first design \+ \$\$\{STICKER_SETUP_FEE_ADDITIONAL\.toFixed\(2\)\} x /
  );
});

test("no hardcoded setup figure survives in the page", () => {
  assert.doesNotMatch(page, /\$25 first design/);
  assert.doesNotMatch(page, /\$12\.50 x /);
});

test("and the constants are the $15 / $7.50 the invoice charges", () => {
  assert.equal(STICKER_SETUP_FEE, 15);
  assert.equal(STICKER_SETUP_FEE_ADDITIONAL, 7.5);
});
