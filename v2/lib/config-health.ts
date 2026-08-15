/**
 * What this deployment can actually do, given what is configured.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Every integration in this app degrades quietly on purpose, and that is the
 * right call individually: a missing Zapier hook must not fail somebody's
 * order, and an unreachable Printavo must not stop a quote being emailed.
 *
 * Together they add up to a system that cannot tell you what it is not doing.
 * The newsletter is the clearest case — with no hook configured, a customer
 * ticks the box, the shop's email says "Opted in", the consent record is
 * written, and nobody is ever added to the list. Nothing is broken anywhere.
 * Nothing is happening either.
 *
 * So this reports by CAPABILITY, not by variable: what works, what does not,
 * and what the consequence is in the shop's terms. A list of unset variable
 * names would need someone to already know what each one turns off.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type CapabilityState = "live" | "degraded" | "off";

export type Capability = {
  key: string;
  /** What the shop calls this. */
  name: string;
  state: CapabilityState;
  /** What is true right now, in terms of what happens to an order. */
  summary: string;
  /** Exactly what to set to change it. Empty when nothing is needed. */
  fix: string[];
};

function has(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getConfigHealth(): {
  capabilities: Capability[];
  /** True when anything customer-visible is not working as intended. */
  needsAttention: boolean;
} {
  const capabilities: Capability[] = [];

  // ---- the shop finding out an order exists --------------------------------
  const resend = has("RESEND_API_KEY");
  const gmail = has("GMAIL_USER") && has("GMAIL_APP_PASSWORD");

  capabilities.push({
    key: "quote-email",
    name: "Quote emails to the shop",
    state: resend || gmail ? "live" : "off",
    summary:
      resend || gmail
        ? `Sending via ${resend ? "Resend" : "Gmail"} to ${
            process.env.QUOTE_TO_EMAIL?.trim() || "quote@gorillasalem.com"
          }.`
        : // This is the one that matters most. Orders still submit and the
          // customer is still told it worked — the shop simply never hears.
          "NO EMAIL PROVIDER. Orders submit and customers get a confirmation, but the shop is never told an order came in.",
    fix:
      resend || gmail
        ? []
        : ["RESEND_API_KEY", "or GMAIL_USER + GMAIL_APP_PASSWORD"],
  });

  // ---- abandoned quotes ----------------------------------------------------
  //
  // Two independent questions, and reporting only the second one is how a
  // health check misleads: with no provider at all these are not sent
  // anywhere, and saying "going to the main quote inbox" would describe a
  // fallback that never runs. The provider is named first because it is the
  // one that has to be fixed.
  capabilities.push({
    key: "lead-notices",
    name: "Abandoned-quote notices",
    state: resend || gmail ? "live" : "off",
    summary: !(resend || gmail)
      ? "Not sent — there is no email provider configured (see above)."
      : has("LEAD_TO_EMAIL")
      ? `Going to their own inbox (${process.env.LEAD_TO_EMAIL?.trim()}).`
      : // Not a fault. Worth saying because these arrive far more often than
        // real orders and will bury them in a shared inbox.
        "Going to the main quote inbox. They arrive far more often than real orders, so consider splitting them out.",
    fix: !(resend || gmail)
      ? ["RESEND_API_KEY", "or GMAIL_USER + GMAIL_APP_PASSWORD"]
      : has("LEAD_TO_EMAIL")
      ? []
      : ["LEAD_TO_EMAIL (optional)"],
  });

  // ---- Printavo ------------------------------------------------------------
  const printavo = has("PRINTAVO_EMAIL") && has("PRINTAVO_TOKEN");

  capabilities.push({
    key: "printavo",
    name: "Printavo quotes",
    state: printavo ? "live" : "off",
    summary: printavo
      ? "Quotes are pushed to Printavo as unconfirmed."
      : "Quotes are NOT reaching Printavo. The shop email is the only record, and sticker orders cannot generate a payment link.",
    fix: printavo ? [] : ["PRINTAVO_EMAIL", "PRINTAVO_TOKEN"],
  });

  // ---- the order tracker ---------------------------------------------------
  capabilities.push({
    key: "order-tracker",
    name: "Order tracker (/track)",
    state: printavo ? "live" : "off",
    summary: printavo
      ? "Customers can look up their order status."
      : "Every lookup answers 'we can't reach our order system'. Do not link to /track until Printavo is configured.",
    fix: printavo ? [] : ["PRINTAVO_EMAIL", "PRINTAVO_TOKEN"],
  });

  // ---- newsletter ----------------------------------------------------------
  const zap = has("ZAPIER_NEWSLETTER_HOOK_URL");

  capabilities.push({
    key: "newsletter",
    name: "Newsletter sign-ups",
    state: zap ? "live" : "off",
    summary: zap
      ? "Sign-ups are posted to Zapier for Constant Contact."
      : // The dangerous kind of "off": it looks like it is working from every
        // angle except the list itself.
        "Customers can tick the box and the shop email says 'Opted in', but NOBODY is being added to Constant Contact. Consent is recorded, so the list can be backfilled from past quote emails.",
    fix: zap ? [] : ["ZAPIER_NEWSLETTER_HOOK_URL"],
  });

  // ---- kiosk ---------------------------------------------------------------
  capabilities.push({
    key: "kiosk-staff",
    name: "Kiosk staff mode",
    state: has("KIOSK_PIN") ? "live" : "off",
    summary: has("KIOSK_PIN")
      ? "Staff can sign in at /kiosk and write orders up for customers."
      : "Self-service works. Staff mode is unavailable — the PIN prompt refuses every attempt.",
    fix: has("KIOSK_PIN") ? [] : ["KIOSK_PIN"],
  });

  // ---- artwork uploads -----------------------------------------------------
  const blob = has("BLOB_READ_WRITE_TOKEN");

  capabilities.push({
    key: "artwork-uploads",
    name: "Large artwork uploads",
    state: blob ? "live" : "degraded",
    summary: blob
      ? "Artwork goes straight to blob storage, up to 100 MB."
      : "Artwork rides in the request body, so the ceiling is 3.5 MB. Bigger files still submit the order — the shop is told to collect them by email.",
    fix: blob ? [] : ["BLOB_READ_WRITE_TOKEN (optional)"],
  });

  // ---- apparel -------------------------------------------------------------
  capabilities.push({
    key: "admin-tools",
    name: "Admin endpoints",
    state: has("ADMIN_SECRET") ? "live" : "off",
    summary: has("ADMIN_SECRET")
      ? "Payment requests and diagnostics are reachable with the secret."
      : "Payment-request and diagnostic endpoints refuse every call. They fail closed, so this is safe — just unavailable.",
    fix: has("ADMIN_SECRET") ? [] : ["ADMIN_SECRET"],
  });

  return {
    capabilities,
    // "degraded" is a deliberate choice with a stated fallback, so it does not
    // raise the flag on its own. Only a capability that is OFF does.
    needsAttention: capabilities.some((c) => c.state === "off"),
  };
}
