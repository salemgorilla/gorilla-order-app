/**
 * THE PAY BUTTON HAS TO BE AT THE END OF THE PAGE, NOT ONLY NEAR THE TOP.
 *
 * Gabe, 2026-09-11: "the signs, stickers and banner buttons do not end with
 * a pay button. They end with a white button. Why did this change back?"
 *
 * Nothing had regressed. Production logs for his own two tests that
 * afternoon — GS-20260911-IKPLS (stickers) and GS-20260911-AOADE (signs) —
 * both read `billed=true` with a live Printavo link, and the pay block
 * renders correctly from that response.
 *
 * What was wrong was WHERE it sat. Between the pay block and the end of the
 * page came the quote number, three detail cards, a disclaimer, and then a
 * row whose first button is a white "Copy Quote Details". On a phone the
 * last thing under the customer's thumb was a backup action, and the one
 * thing the shop needs them to do was four scrolls back up.
 *
 * These are source assertions rather than a render, because the ORDER of
 * these elements is the whole property and it is the thing a future edit
 * moves without noticing.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const confirmation = readFileSync(
  new URL("../features/QuoteConfirmation.tsx", import.meta.url),
  "utf8"
);

describe("where the pay button sits", () => {
  it("there are two of them, both gated on a real link", () => {
    const gates = confirmation.match(/\{payUrl && \(/g) || [];

    assert.equal(gates.length, 2, "expected a pay block at the top and one at the end");
  });

  it("the second one comes after the backup actions' explainer", () => {
    // i.e. it is at the END of the page, not a duplicate stacked under the
    // first one where it would add nothing.
    const explainer = confirmation.indexOf("Use Copy Quote Details as a backup");
    const lastPay = confirmation.lastIndexOf("{payUrl && (");

    assert.ok(explainer > 0 && lastPay > explainer, "the second pay button is not at the end");
  });

  it("and BEFORE the white button, which is what he was seeing", () => {
    const lastPay = confirmation.lastIndexOf("{payUrl && (");
    const copyButton = confirmation.indexOf("Copy Quote Details", lastPay);

    assert.ok(copyButton > lastPay, "the white backup button still ends the page");
  });

  it("it carries the amount and the deposit wording, like the first", () => {
    // A second button that said only "Pay" would be a different promise from
    // the one above it, on the screen where the figure is first seen.
    const tail = confirmation.slice(confirmation.lastIndexOf("{payUrl && ("));

    assert.match(tail, /isDeposit \? "Pay 50% deposit" : "Pay now"/);
    assert.match(tail, /payAmount\.toFixed\(2\)/);
  });

  it("nothing renders when there is no link to render", () => {
    // Apparel never bills here, and a sticker order Printavo could not reach
    // has no link either. Both must end on the backup row, honestly.
    const tail = confirmation.slice(confirmation.lastIndexOf("{payUrl && ("));

    assert.match(tail, /^\{payUrl && \(/);
    // The backup row's top margin closes up when the pay button is there,
    // and opens back out when it is not.
    assert.match(confirmation, /payUrl \? "mt-4" : "mt-8"/);
  });
});
