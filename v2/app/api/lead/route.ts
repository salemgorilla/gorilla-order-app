import { NextResponse } from "next/server";

import { productCategories } from "../../../lib/products";

import { looksLikeEmailAddress } from "../../../lib/email-address";

import { escapeEmailHtml, sendShopEmail } from "../../../lib/email";

/**
 * Unfinished quotes.
 *
 * A customer could configure a whole order — size, quantity, material,
 * delivery — and abandon before the last step, and the shop got nothing. No
 * name, no email, no idea anyone had been in. That is the single biggest
 * lead loss in the funnel, because the effort was already spent.
 *
 * This route records that someone got far enough to give an email and then
 * left. It is NOT the quote pipeline and must never become it:
 *
 *   - it does not import lib/printavo, so it cannot create a quote record and
 *     it cannot generate a payment link;
 *   - it issues no quote number, because a quote number is the shop's promise
 *     that something was actually submitted;
 *   - the subject says INCOMPLETE first, so it can never be worked as an
 *     order that came in.
 *
 * Called with navigator.sendBeacon as the page is hidden, so it must stay
 * cheap and must always answer — a beacon cannot retry and nobody is waiting
 * on the response.
 */

/** Long enough for a real note, short enough that the route cannot be a dump. */
const MAX_FIELD = 2000;

function clean(value: unknown, limit = 300) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/**
 * Deliberately permissive: this decides whether a lead is worth telling the
 * shop about, not whether an address is deliverable — a rule that rejects a
 * real address loses exactly the lead this route exists to keep.
 *
 * It used to say that with its OWN copy of the regex, subtly looser than the
 * one lib/email-address.ts applies. The only inputs the two disagreed about
 * were trailing dots and doubled dots — "a@b.c." and "a@b..c" — which no
 * provider accepts, so the extra permissiveness admitted nothing anyone could
 * follow up and cost a third copy of a rule that was already duplicated
 * three ways. If leads ever need a looser test than the form does, loosen it
 * in one place.
 */
function looksLikeEmail(value: string) {
  return looksLikeEmailAddress(value);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // A malformed beacon is not worth a 400 nobody will read.
    return new NextResponse(null, { status: 204 });
  }

  const email = clean(body.email);

  // No address, nothing to follow up. Silently accepted rather than rejected:
  // the client fires this on page-hide and cannot act on an error.
  if (!looksLikeEmail(email)) {
    return new NextResponse(null, { status: 204 });
  }

  const name = clean(body.name);
  const company = clean(body.company);
  const phone = clean(body.phone);
  const flow = clean(body.flow, 60) || "unknown";
  /**
   * The shop reads this email; the browser's flow id is not its vocabulary.
   * "Product: banners" is a lowercase internal key — the card the customer
   * actually clicked says "Vinyl Banners". Resolved against the real product
   * catalogue so a renamed or added card can never drift from this email,
   * and the raw id passes through for anything unrecognised rather than
   * hiding it.
   */
  const flowTitle =
    productCategories.find((product) => product.id === flow)?.title || flow;
  const step = clean(body.step, 60) || "unknown";
  const summary = clean(body.summary, MAX_FIELD);

  const lines = [
    ["Name", name || "Not given"],
    ["Email", email],
    ["Phone", phone || "Not given"],
    ["Company", company || "Not given"],
    ["Product", flowTitle],
    ["Got as far as", step],
    ["What they had configured", summary || "Nothing recorded"],
  ];

  const text = [
    "INCOMPLETE QUOTE — this customer did NOT submit.",
    "",
    "They entered an email in the quote builder and left before sending it.",
    "Nothing has been quoted, nothing has been charged, and no Printavo",
    "record exists. This is a follow-up prompt, not an order.",
    "",
    ...lines.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b23a2e;font-weight:700;">Incomplete quote</p>
    <h1 style="margin:0 0 12px;font-size:20px;color:#111111;">${escapeEmailHtml(
      name || email
    )} did not finish their quote</h1>
    <p style="margin:0 0 16px;color:#5f594e;font-size:14px;line-height:1.5;">
      They got as far as entering an email and left before submitting. Nothing
      was quoted, nothing was charged, and there is no Printavo record. This is
      a follow-up prompt, not an order.
    </p>
    <table style="border-collapse:collapse;font-size:14px;">${lines
      .map(
        ([label, value]) =>
          `<tr><td style="padding:3px 12px 3px 0;color:#5f594e;white-space:nowrap;vertical-align:top;">${escapeEmailHtml(
            label
          )}</td><td style="padding:3px 0;color:#111111;font-weight:600;">${escapeEmailHtml(
            value
          )}</td></tr>`
      )
      .join("")}</table>
  </div>`;

  // Never awaited into a failure. The customer is already gone; whether the
  // shop's mail provider is having a moment is not their problem.
  try {
    await sendShopEmail({
      // Its own inbox when one is configured, falling back to the quote
      // inbox. These are follow-up prompts, not orders, and they arrive far
      // more often than real submissions — left in the same inbox they bury
      // the quotes that actually need working.
      to: process.env.LEAD_TO_EMAIL,
      subject: `INCOMPLETE quote — ${name || email} (${flowTitle})`,
      text,
      html,
      replyTo: email,
    });
  } catch {
    // Swallowed on purpose. See above.
  }

  return new NextResponse(null, { status: 204 });
}
