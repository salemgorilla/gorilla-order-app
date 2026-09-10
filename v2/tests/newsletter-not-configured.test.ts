/**
 * THE ROW THAT SAYS "OPTED IN" HAS TO BE TRUE WHERE IT IS READ.
 *
 * ── THE DANGEROUS KIND OF OFF ─────────────────────────────────────────────
 * With no ZAPIER_NEWSLETTER_HOOK_URL set, a customer ticks the box, the
 * shop's email says "Opted in", the consent record is written — and nobody
 * is ever added to Constant Contact. lib/config-health.ts has said so since
 * it was written: "Nothing is broken anywhere. Nothing is happening either."
 *
 * It says so on the admin health page, which is behind a secret and is not
 * read on an ordinary Tuesday. The shop email is read on every order, and
 * it is where the claim is made. So the row makes the claim honest.
 *
 * ── THE BOX IS NOT HIDDEN, AND THAT IS SETTLED ───────────────────────────
 * Gabe, 2026-09-09: "Don't hide the box."
 *
 * The obvious alternative — no hook, no checkbox — was asked for and was
 * declined, because it destroys something this repo keeps on purpose.
 * config-health.ts, on the same failure: "Consent is recorded, so the list
 * can be backfilled from past quote emails." Hiding the box throws that
 * away; asking and saying so does not.
 *
 * So this row is the whole fix, and it has to keep working. A future
 * session that reads "nobody is added to any list" and reaches for the
 * obvious remedy would be undoing a decision the shop has already made —
 * the test below is here to be the thing it trips over.
 *
 * ── UNDEFINED ASSERTS NOTHING ────────────────────────────────────────────
 * `false` is the only value that changes a rendering. A caller that does
 * not know whether the hook is set must not be able to imply either
 * answer — which is also why every existing test of this email keeps
 * passing untouched.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildCustomerLines, buildQuoteEmail } from "../lib/email";
import { isNewsletterConfigured, subscribeToNewsletter } from "../lib/newsletter";
import { unsubscribeEmail, type SubscriberStore } from "../lib/subscribers";

const optedIn = {
  customerName: "Stacey",
  email: "stacey@example.com",
  newsletterOptIn: true,
};

function newsletterRow(lines: string[]): string {
  return lines.find((entry) => entry.startsWith("Newsletter")) ?? "";
}

describe("the shop email tells the truth about the list", () => {
  it("says the sign-up went nowhere when no hook is configured", () => {
    const row = newsletterRow(
      buildCustomerLines({ customer: optedIn, newsletterConfigured: false })
    );

    assert.match(row, /Opted in/);
    assert.match(row, /NOT added to any list/);
    assert.match(row, /no newsletter hook is configured/i);
  });

  it("and that the consent is still recorded, so it can be backfilled", () => {
    // Without this the row reads as "we lost it", and the shop's reasonable
    // response to that is to stop asking — which is the opposite of what
    // the recorded consent is for.
    const row = newsletterRow(
      buildCustomerLines({ customer: optedIn, newsletterConfigured: false })
    );

    assert.match(row, /backfilled/i);
  });

  it("says nothing extra when the hook IS configured", () => {
    const row = newsletterRow(
      buildCustomerLines({ customer: optedIn, newsletterConfigured: true })
    );

    assert.match(row, /Opted in \(box shipped pre-ticked\)/);
    assert.doesNotMatch(row, /NOT added/);
  });

  it("undefined changes nothing at all", () => {
    // Every caller written before this existed. A missing answer must not
    // become an assertion in either direction.
    assert.equal(
      newsletterRow(buildCustomerLines({ customer: optedIn })),
      newsletterRow(
        buildCustomerLines({ customer: optedIn, newsletterConfigured: true })
      )
    );
  });

  it("the box is still asked for — hiding it was declined, not deferred", () => {
    // Gabe, 2026-09-09: "Don't hide the box." The consent question is
    // rendered by CustomerForm unconditionally and takes no configuration
    // flag, so there is nothing that CAN suppress it. If that ever changes,
    // this is the assertion that says the change was not asked for.
    const form = readFileSync(
      new URL("../components/CustomerForm.tsx", import.meta.url),
      "utf8"
    );

    assert.match(form, /Email me occasional Gorilla Salem news and offers/);
    assert.doesNotMatch(form, /newsletterConfigured|newsletterHook/);
  });

  it("a customer who declined gets no warning about a list they are not on", () => {
    const row = newsletterRow(
      buildCustomerLines({
        customer: { ...optedIn, newsletterOptIn: false },
        newsletterConfigured: false,
      })
    );

    assert.match(row, /Declined/);
    assert.doesNotMatch(row, /NOT added/);
  });

  it("the kiosk wording survives, warning and all", () => {
    // The kiosk box starts EMPTY, so "ticked deliberately" is a materially
    // different consent record and must not be overwritten by the warning.
    const row = newsletterRow(
      buildCustomerLines({
        customer: optedIn,
        kiosk: { mode: "self" },
        newsletterConfigured: false,
      })
    );

    assert.match(row, /ticked deliberately/);
    assert.match(row, /NOT added to any list/);
  });
});

describe("both renderings, or the archive disagrees with the inbox", () => {
  const email = buildQuoteEmail({
    quoteNumber: "GS-20260909-AB12C",
    receivedAt: new Date("2026-09-09T12:00:00Z").toISOString(),
    order: {
      customer: optedIn,
      production: { deliveryMethod: "Pickup", needBy: "2026-10-05" },
      product: { type: "Custom Stickers", quantity: 100 },
      pricing: { total: 55.6 },
    } as never,
    artworkAnalysis: null,
    newsletterConfigured: false,
  });

  it("the plain text carries it", () => {
    assert.match(email.text, /NOT added to any list/);
  });

  it("so does the HTML", () => {
    assert.match(email.html, /NOT added to any list/);
  });
});

describe("the customer is told too, not only the shop", () => {
  const route = readFileSync(
    new URL("../app/api/quote/route.ts", import.meta.url),
    "utf8"
  );

  it("the confirmation email is given the same answer the consent record is", () => {
    // The SAME `optedIn` const, not a second reading of the field. Two
    // readings is two chances for one to drift, and the two that must never
    // disagree are the record the shop keeps and the sentence the customer
    // is sent. See tests/order-confirmation for what the email says.
    assert.match(route, /const optedIn = customerRecord\.newsletterOptIn === true/);
    assert.match(route, /newsletterOptIn: optedIn,/);
    assert.equal(
      route.split("customerRecord.newsletterOptIn").length - 1,
      1,
      "the field is read in more than one place"
    );
  });
});

describe("the route asks, and asks in one place", () => {
  const route = readFileSync(
    new URL("../app/api/quote/route.ts", import.meta.url),
    "utf8"
  );

  it("passes the real answer to the email builder", () => {
    assert.match(route, /newsletterConfigured: isNewsletterConfigured\(\)/);
  });

  it("reads the variable through that function, never inline", () => {
    // Two readings of one env var is two chances for one of them to be the
    // one that drifts. The subscriber and the email row must agree.
    assert.doesNotMatch(route, /BLOB_READ_WRITE_TOKEN/);
  });
});

describe("the answer comes from the environment, once", () => {
  it("asks whether there is anywhere to KEEP a list", () => {
    // The question used to be "is the Zapier hook set". Gabe quit Constant
    // Contact on 2026-09-10 and the list moved into the shop's own blob
    // store, so it is now "is there a store" — the same question about the
    // shop's own storage, asked in one place.
    const before = process.env.BLOB_READ_WRITE_TOKEN;

    try {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      assert.equal(isNewsletterConfigured(), false);

      // A pasted value with a trailing newline is invisible in the Vercel
      // UI and invisible in the error it causes — every secret in this repo
      // is read with .trim() for that reason.
      process.env.BLOB_READ_WRITE_TOKEN = "   \n";
      assert.equal(isNewsletterConfigured(), false);

      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_abc123\n";
      assert.equal(isNewsletterConfigured(), true);
    } finally {
      if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = before;
    }
  });
});

describe("a sign-up now lands in the shop's own store", () => {
  /**
   * The end of the Zapier path. Gabe, 2026-09-10: "I quit constant
   * contact." What used to be a POST to a catch hook is a write to a blob
   * the shop owns — which is what makes the confirmation email's promise
   * ("we will not sell your information") true by construction: there is no
   * longer a mechanism in this app that hands a subscriber to anyone.
   */
  function memoryStore(): SubscriberStore & { files: Map<string, string> } {
    const files = new Map<string, string>();

    return {
      files,
      async put(pathname, body) {
        files.set(pathname, body);
      },
      async read(pathname) {
        return files.get(pathname) ?? null;
      },
      async list(prefix) {
        return {
          pathnames: [...files.keys()].filter((key) => key.startsWith(prefix)),
        };
      },
    };
  }

  const payload = {
    email: "stacey@example.com",
    name: "Stacey",
    company: "Salem Rowing",
    phone: "978-555-0100",
    heardAbout: ["Google"],
    quoteNumber: "GS-20260910-AB12C",
    consent: {
      optedIn: true,
      at: "2026-09-10T12:00:00.000Z",
      source: "labs.gorillasalem.com quote builder",
      preChecked: true,
    },
  };

  it("stores the sign-up", async () => {
    const store = memoryStore();
    const result = await subscribeToNewsletter(payload, store);

    assert.deepEqual(result, { sent: true });
    assert.equal(store.files.size, 1);
  });

  it("carries no third party in it at all", async () => {
    // The whole point of the move. Nothing about Zapier, nothing about
    // Constant Contact, no outbound call to anyone.
    const source = readFileSync(
      new URL("../lib/newsletter.ts", import.meta.url),
      "utf8"
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    assert.doesNotMatch(code, /zapier/i);
    assert.doesNotMatch(code, /constant.?contact/i);
    assert.doesNotMatch(code, /fetch\(/);
  });

  it("a 'no' still cannot become a subscription", async () => {
    const store = memoryStore();

    const declined = await subscribeToNewsletter(
      { ...payload, consent: { ...payload.consent, optedIn: false } },
      store
    );

    assert.equal(declined.sent, false);
    assert.equal(store.files.size, 0);
  });

  it("somebody who unsubscribed is not handed back by the pre-ticked box", async () => {
    const store = memoryStore();

    await subscribeToNewsletter(payload, store);
    await unsubscribeEmail(payload.email, "2026-10-01T00:00:00.000Z", store);

    const again = await subscribeToNewsletter(
      { ...payload, consent: { ...payload.consent, at: "2026-12-01T00:00:00.000Z" } },
      store
    );

    assert.equal(again.sent, false);
    assert.match(
      "reason" in again ? again.reason : "",
      /previously unsubscribed/i
    );
  });

  it("with no store, it is skipped and the quote is untouched", async () => {
    const before = process.env.BLOB_READ_WRITE_TOKEN;

    try {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      const result = await subscribeToNewsletter(payload);

      assert.equal(result.sent, false);
      assert.equal("skipped" in result && result.skipped, true);
    } finally {
      if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = before;
    }
  });
});
