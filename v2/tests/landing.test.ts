import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { QUOTE_RUN, buildOfferings, buildPanels, turnaroundFacts, type SpecimenKind } from "../lib/landing";
import { LANDING_PHOTOS } from "../lib/landing-photos";
import { getReferenceStickerPrice } from "../lib/reference-quote";
import { productCategories } from "../lib/products";
import { signsPricingConfig } from "../lib/signs-pricing-config";
import { turnaroundRules } from "../lib/turnaround";
import { paperProducts } from "../lib/paper";

/**
 * THE LANDING PAGE TELLS THE TRUTH, AND KEEPS TELLING IT.
 *
 * Gabe, 2026-11-11: a new front door in the Republic register, with the full
 * line on one page as thumbs. A landing page is where a shop says "from $X"
 * and "ready by Y" before anyone has spent a minute on the form, so the
 * properties held here are about whether it can lie: every figure is read from
 * the config that bills, every thumb starts a flow that exists, and nothing
 * that is not live is on the shelf.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the line", () => {
  const offerings = buildOfferings();

  test("it is the whole shelf, once each", () => {
    assert.equal(offerings.length, 13);
    assert.equal(new Set(offerings.map((o) => o.code)).size, offerings.length, "codes must be unique");
    assert.equal(new Set(offerings.map((o) => o.name)).size, offerings.length, "names must be unique");
    assert.equal(new Set(offerings.map((o) => o.specimen)).size, offerings.length, "one drawing each");
  });

  test("every thumb starts a product that exists and can be started", () => {
    for (const offering of offerings) {
      const product = productCategories.find((p) => p.id === offering.productId);

      assert.ok(product, `${offering.name}: no product ${offering.productId}`);
      assert.notEqual(product.status, "coming-soon", `${offering.name} is on the shelf but not live`);
    }
  });

  test("'instant price' is only claimed where the engine prices it", () => {
    // A hand-quoted product must never wear the instant-price label.
    for (const offering of offerings) {
      const product = productCategories.find((p) => p.id === offering.productId)!;

      if (offering.how === "price") {
        assert.equal(product.status, "active", `${offering.name} claims a price the flow does not give`);
      }
    }
    // Paper and apparel are quote requests today.
    assert.ok(offerings.filter((o) => o.productId === "paper").every((o) => o.how === "quote"));
    assert.ok(offerings.filter((o) => o.productId === "apparel").every((o) => o.how === "quote"));
  });

  test("the money on a thumb is the engine's figure, not a typed one", () => {
    const by = (code: string) => offerings.find((o) => o.code === code)!;

    assert.match(by("STK").spec, new RegExp(`from \\$${getReferenceStickerPrice().toFixed(2).replace(".", "\\.")}`));
    assert.ok(by("BNR").spec.includes(`$${signsPricingConfig.minimumOrder.banners}`));
    assert.ok(by("YRD").spec.includes(`$${signsPricingConfig.minimumOrder.signs}`));
    assert.ok(by("PST").spec.includes(`${signsPricingConfig.poster.perSqft}`));

    const cheapestRigid = Math.min(...Object.values(signsPricingConfig.rigid.perSqftByMaterial));
    assert.ok(by("RGD").spec.includes(`$${cheapestRigid}/sq ft`) || by("RGD").spec.includes(`$${cheapestRigid.toFixed(2)}/sq ft`));
    assert.ok(by("RGD").spec.startsWith(`${Object.keys(signsPricingConfig.rigid.perSqftByMaterial).length} materials`));
  });

  test("paper sizes are the catalogue's", () => {
    for (const [code, id] of [
      ["BCD", "business-cards"],
      ["RCK", "rack-cards"],
      ["PCD", "postcards"],
      ["TRI", "brochures"],
      ["MNU", "menus"],
      ["LTR", "letterhead"],
    ] as const) {
      const product = paperProducts.find((p) => p.id === id)!;
      const spec = offerings.find((o) => o.code === code)!.spec;

      assert.ok(spec.includes(product.sizes[0].label.replace(/ \(.*\)$/, "")), `${code}: ${spec}`);
    }
  });

  test("nothing that is not live is advertised", () => {
    const everything = JSON.stringify(offerings).toLowerCase();

    assert.doesNotMatch(everything, /embroider|coming soon|soon/);
  });
});

describe("the five panels", () => {
  const panels = buildPanels();

  test("one per product family — exactly the five product cards, in the order they are sold", () => {
    assert.deepEqual(
      panels.map((p) => p.productId),
      productCategories.map((p) => p.id)
    );
  });

  test("each starts a flow that is live, and its label is the product's, not a slogan", () => {
    for (const panel of panels) {
      const product = productCategories.find((p) => p.id === panel.productId)!;

      assert.notEqual(product.status, "coming-soon");
      assert.equal(panel.lines.length, 2);
      assert.ok(panel.lines.every((line) => line.trim().length > 0));
    }
  });

  test("the money on a panel is the engine's", () => {
    const by = (id: string) => panels.find((p) => p.productId === id)!;

    assert.ok(by("stickers").spec.includes(`$${getReferenceStickerPrice().toFixed(2)}`));
    assert.ok(by("banners").spec.includes(`$${signsPricingConfig.minimumOrder.banners}`));
    assert.ok(by("signs").spec.includes(`$${signsPricingConfig.minimumOrder.signs}`));
  });

  test("no photograph is invented: a panel has one only if the shop supplied it", () => {
    for (const panel of panels) {
      assert.deepEqual(panel.photo, LANDING_PHOTOS[panel.productId] ?? null);
    }
  });

  test("a supplied photo renders as an image with its alt text; otherwise the emblem", () => {
    const landing = read("../features/landing/Landing.tsx");

    assert.match(landing, /panel\.photo \?[\s\S]*?<img[\s\S]*?alt=\{panel\.photo\.alt\}[\s\S]*?\) : \(/);
    assert.match(landing, /<Specimen kind=\{panel\.emblem\} \/>/);
  });

  test("the label is on a solid band, not a fade", () => {
    const landing = read("../features/landing/Landing.tsx");
    const panel = landing.slice(landing.indexOf("function PanelButton"), landing.indexOf("function Cell"));

    assert.match(panel, /bg-\[var\(--ink-black\)\] px-3/);
    assert.doesNotMatch(panel.replace(/\/\*[\s\S]*?\*\//g, ""), /gradient|from-|to-|via-/);
  });
});

describe("the page itself", () => {
  const landing = read("../features/landing/Landing.tsx");
  const specimen = read("../features/landing/Specimen.tsx");
  const page = read("../app/page.tsx");

  test("every drawing exists", () => {
    const kinds: SpecimenKind[] = buildOfferings().map((o) => o.specimen);

    for (const kind of kinds) {
      assert.ok(specimen.includes(`kind === "${kind}"`), `no drawing for ${kind}`);
    }
  });

  test("the grid is built from rules, with the Order Desk tokens and no raw colour or shadow", () => {
    assert.match(landing, /gap-px[^"]*bg-\[var\(--rule\)\]/);
    // The files explain, in their header comments, what they refuse to do
    // ("no gradient, no shadow"); only the CODE is held to it.
    const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const [name, source] of [["Landing", code(landing)], ["Specimen", code(specimen)]]) {
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${name}: raw hex — add a token instead`);
      assert.doesNotMatch(source, /shadow-|blur|gradient|filter|rounded-/, `${name}: a banned surface effect`);
    }
  });

  test("every interactive thing is a real button with a focus ring and a 44px target", () => {
    const buttons = landing.match(/<button[\s\S]*?>/g) ?? [];

    assert.equal(buttons.length, 3, "a panel, a thumb, and 'Start a quote'");
    for (const button of buttons) {
      assert.match(button, /type="button"/);
    }
    assert.ok((landing.match(/min-h-\[(44|380)px\]/g) ?? []).length >= 3);
    assert.ok(landing.includes("focus-visible:outline"));
  });

  test("the drawings are decoration: hidden from assistive tech, the button carries the name", () => {
    assert.match(specimen, /aria-hidden="true"/);
    assert.match(landing, /\{offering\.name\}/);
  });

  test("a thumb runs the SAME selection as the product card, and checkout is untouched", () => {
    assert.match(page, /<Landing[\s\S]*?selectProduct\(product\)/);
    assert.match(page, /currentStepId === "product" && !kiosk\.enabled && \(\s*<Landing/);
    // The picker below is still the way in, and has an anchor to scroll to.
    assert.match(page, /<section id="start"/);
  });

  test("the terms come from the lanes the order is held to", () => {
    const facts = turnaroundFacts();

    assert.deepEqual(facts, [
      { products: turnaroundRules.fast.products, promise: turnaroundRules.fast.promise },
      { products: turnaroundRules.slow.products, promise: turnaroundRules.slow.promise },
    ]);
  });

  test("the five steps are the form's five steps", () => {
    const steps = read("../lib/steps.ts");

    assert.equal(QUOTE_RUN.length, 5);
    for (const row of QUOTE_RUN) {
      assert.ok(new RegExp(row.step, "i").test(steps), `step "${row.step}" is not in lib/steps.ts`);
    }
  });

  test("it never says there is a card fee, and the refund is described as a refund", () => {
    const rendered = landing.slice(landing.indexOf("export default function Landing"));

    assert.doesNotMatch(rendered, /card fee|surcharge|processing fee/i);
    assert.match(rendered, /bank transfer and we refund the\s+3%/);
  });
});
