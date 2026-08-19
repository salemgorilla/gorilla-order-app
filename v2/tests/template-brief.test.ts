import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { asciiSafe, buildPrintavoQuotePlan } from "../lib/printavo";
import { DESIGN_TEMPLATES, resolveTemplateText } from "../lib/templates";

/**
 * A template sign reaching the shop's production system.
 *
 * ── WHAT WAS MISSING ──────────────────────────────────────────────────────
 * A template REPLACES the upload — lib/validation.ts stops asking for a file
 * the moment one is chosen, because the template IS the artwork. So for these
 * orders there is no attachment anywhere, and the words the customer typed
 * are the entire job.
 *
 * They reached the shop email and nothing else. Run against the real builder,
 * the Printavo record for a 50-sign order read:
 *
 *   50x Yard Sign / Size / Material / Finishing / Sides
 *
 * with no hint a brief existed — while its production note said "Artwork is
 * attached to the quote email", which for a template order is false and sends
 * whoever reads it hunting for a file that was never created.
 *
 * Apparel had already settled the same argument for its own flow: a special
 * order appends the customer's notes to the description, because what they
 * asked for IS the job. Signs had the identical case and no code. That is the
 * shape this repo keeps producing — right in one flow, absent in its sibling.
 * ──────────────────────────────────────────────────────────────────────────
 */

const TEMPLATE = DESIGN_TEMPLATES[0];

function templateText(values: string[]) {
  const byId: Record<string, string> = {};
  TEMPLATE.fields.forEach((field, index) => {
    byId[field.id] = values[index] ?? "";
  });
  return resolveTemplateText(TEMPLATE.id, byId);
}

function signsPlan(artwork: Record<string, unknown>) {
  return buildPrintavoQuotePlan({
    quoteNumber: "GS-TEST",
    order: {
      customer: { customerName: "Casey", email: "casey@example.com" },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-01" },
      product: {
        type: "Banners & Signs",
        signType: "Yard Sign",
        quantity: 50,
        size: '18" x 24"',
        material: "Coroplast",
      },
      artwork,
      pricing: { total: 240, quoteRequired: false },
    },
    artworkAnalysis: null,
  });
}

const withTemplate = (values: string[]) =>
  signsPlan({
    fileName: null,
    file: null,
    template: {
      id: TEMPLATE.id,
      name: TEMPLATE.name,
      text: templateText(values),
    },
  });

const WORDS = ["OPEN HOUSE", "123 Main St, Salem", "Sat 1-3pm"];

describe("the shop can make the sign from the Printavo record alone", () => {
  const description = withTemplate(WORDS).lineItems[0].description;

  test("every word the customer typed is on the line item", () => {
    for (const word of WORDS) {
      assert.ok(
        description.includes(word),
        `"${word}" is missing — that line of the sign would not get printed`
      );
    }
  });

  test("each line is labelled, so the shop knows which is which", () => {
    // "OPEN HOUSE" alone does not say whether it is the headline or the
    // address. The template's own field labels are what make it a brief.
    for (const field of TEMPLATE.fields) {
      assert.ok(description.includes(field.label), field.label);
    }
  });

  test("it says there is no file to go looking for", () => {
    assert.match(description, /NO FILE UPLOADED/);
  });

  test("and which master to set the words into", () => {
    assert.ok(description.includes(TEMPLATE.name));
  });

  test("the spec is still there above it", () => {
    // The brief is added to the line item, not instead of it.
    assert.match(description, /50x Yard Sign/);
    assert.match(description, /Material: Coroplast/);
  });
});

describe("the production note stops promising a file that does not exist", () => {
  test("a template order says where the words actually are", () => {
    const note = withTemplate(WORDS).productionNote;

    assert.match(note, /No artwork file/);
    assert.doesNotMatch(note, /Artwork is attached/);
  });

  test("an order that HAS a file is not told there is none", () => {
    /**
     * Asserted as a property, not as a sentence. This test used to pin the
     * exact wording "Artwork is attached to the quote email" and broke the
     * moment that line was corrected — the line was itself wrong, so the
     * test was holding a bug in place. What has to stay true is narrower:
     * an order with a file must never be told it has none.
     */
    const note = signsPlan({
      fileName: "banner.pdf",
      file: { name: "banner.pdf" },
    }).productionNote;

    assert.doesNotMatch(note, /No artwork file/);
    assert.match(note, /quote email/);
  });
});

describe("nothing else moved", () => {
  test("an uploaded-file sign gets no template block", () => {
    const description = signsPlan({
      fileName: "banner.pdf",
      file: { name: "banner.pdf" },
    }).lineItems[0].description;

    assert.doesNotMatch(description, /TEMPLATE ARTWORK/);
  });

  test("stickers are unaffected", () => {
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST",
      order: {
        customer: {},
        production: { deliveryMethod: "Pickup" },
        product: { type: "Custom Stickers", quantity: 100 },
        items: [
          {
            quantity: 100,
            material: "Gloss White Vinyl",
            widthInches: 3,
            heightInches: 3,
          },
        ],
        pricing: { total: 50 },
      },
      artworkAnalysis: null,
    });

    assert.doesNotMatch(JSON.stringify(plan), /TEMPLATE ARTWORK/);
  });
});

describe("the awkward cases", () => {
  test("a template with nothing typed says so", () => {
    /**
     * Every field on this template is optional except the headline, and the
     * headline rule blocks submit — so this should be unreachable. It is
     * asserted because an empty block under a "set these words" heading is
     * the kind of thing a shop reads as "the words are missing from the
     * system", which costs a phone call either way. Say it plainly instead.
     */
    const description = withTemplate([]).lineItems[0].description;

    assert.match(description, /left every line blank/);
  });

  test("optional lines the customer skipped are simply absent", () => {
    // resolveTemplateText already drops empties; this pins that the brief
    // does not render "Address:" with nothing after it.
    const description = withTemplate(["OPEN HOUSE"]).lineItems[0].description;

    assert.ok(description.includes("OPEN HOUSE"));
    assert.doesNotMatch(description, /Address:\s*$/m);
  });

  test("a phone keyboard's smart quotes survive the trip", () => {
    /**
     * This description now carries CUSTOMER-TYPED text for the first time,
     * and asciiSafe deletes anything outside \x20-\x7E before sending. A
     * curly apostrophe from an iPhone must transliterate rather than vanish
     * mid-word — "Casey's" must not arrive as "Caseys".
     */
    const description = withTemplate(["Casey’s Open House — today"])
      .lineItems[0].description;

    const sent = asciiSafe(description);

    assert.ok(sent.includes("Casey's Open House - today"), sent);
    assert.doesNotMatch(sent, /[^\x20-\x7E\n]/);
  });
});
