/**
 * THE LOUDEST THING ON THE ADD-ONS CARD HAS TO BE TRUE.
 *
 * ── WHAT IT SAID ──────────────────────────────────────────────────────────
 *   ADDED TO THIS QUOTE: $177.00          bold, spec mono
 *   Your estimate above doesn't change…   muted grey, spec size
 *
 * Both accurate. Only one legible. DESIGN-SYSTEM.md reserves mono for real
 * values — "a signal that a number means something" — and 700 for "the
 * answer", so "ADDED" beside a mono figure asserted "this is on your bill"
 * in the two strongest signals the system has, while the correction was the
 * quietest element on the card.
 *
 * Gabe ticked the banner on a test order (GS-20260925-A87QL) and reported
 * the cost missing from the bill. He built the shop. A customer has no
 * chance.
 *
 * These pin the copy, because the words ARE the fix — a future edit that
 * restores "ADDED TO THIS QUOTE" reintroduces the whole defect with the
 * markup unchanged and every other test still green.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function card(): Promise<string> {
  return readFile(
    new URL("../features/addons/AddOnsCard.tsx", import.meta.url),
    "utf8"
  );
}

/** The file with its comments stripped — the comments quote the old copy. */
async function rendered(): Promise<string> {
  const src = await card();
  return src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
}

describe("the summary line states the fact instead of contradicting it", () => {
  test("it no longer claims the item was ADDED TO THIS QUOTE", async () => {
    const shown = await rendered();

    assert.doesNotMatch(
      shown,
      /ADDED TO THIS QUOTE/,
      "the bold mono line says the add-on is on the bill again"
    );
  });

  test("it says, in that same line, that nothing is charged", async () => {
    // Same element, same weight, same mono. The fact has to ride in the
    // loudest thing on the card, not underneath it.
    const shown = await rendered();

    assert.match(shown, /REQUESTED, NOT CHARGED/);
  });

  test("the real figures are still shown", async () => {
    // The prices are real and the shop needs them. The fix was the label,
    // never hiding the number.
    const shown = await rendered();

    assert.match(shown, /money\(priced\)/);
    assert.match(shown, /items?\$\{quoteCount === 1 \? "" : "s"\}|we'll price/);
  });
});

describe("the explanation is no longer the quietest thing on the card", () => {
  test("it is not muted", async () => {
    const shown = await rendered();
    const para = shown.slice(shown.indexOf("Your estimate above"));
    const openingTag = shown.slice(0, shown.indexOf("Your estimate above")).lastIndexOf("<p");
    const tag = shown.slice(openingTag, shown.indexOf("Your estimate above"));

    assert.doesNotMatch(
      tag,
      /ink-muted/,
      "the one fact a customer needs is rendered as metadata"
    );
    assert.match(tag, /ink-black/);
    assert.ok(para.length > 0);
  });

  test("it still says both halves plainly", async () => {
    const shown = await rendered();

    assert.match(shown, /estimate above does not change/i);
    assert.match(shown, /nothing here is charged now/i);
  });
});
