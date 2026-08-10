import type { NewsletterConsent } from "../types/order";

/**
 * Newsletter sign-ups, handed to Zapier.
 *
 * The app does not talk to Constant Contact. It POSTs to a Zapier catch hook
 * and the Zap does the rest — "Webhooks by Zapier (Catch Hook)" ->
 * "Constant Contact: Create or Update Contact", adding the contact to the
 * subscriber segment. Keeping the ESP behind Zapier means no Constant Contact
 * credentials in this app and no second API to keep working.
 *
 * Set in all three Vercel environments:
 *
 *   ZAPIER_NEWSLETTER_HOOK_URL=https://hooks.zapier.com/hooks/catch/…
 *
 * Unset is a valid state: subscribing is skipped and the quote is unaffected.
 *
 * ── THE RULE THIS FILE EXISTS TO HOLD ─────────────────────────────────────
 * A newsletter sign-up must NEVER affect the quote. It is a marketing nicety
 * bolted to the side of the flow that takes money. Every failure here is
 * swallowed: no throw, no retry storm, no bearing on what the customer is
 * told about their order. If Zapier is down, the shop loses one subscriber
 * and the customer never knows.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type NewsletterSubscribeResult =
  | { sent: true }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped: false; error: string };

export type NewsletterPayload = {
  email: string;
  name: string;
  company: string;
  phone: string;
  /** How they said they found the shop, for segmenting. */
  heardAbout: string[];
  /** Quote this came in on, so a sign-up can be traced to an order. */
  quoteNumber: string;
  consent: NewsletterConsent;
};

export async function subscribeToNewsletter(
  payload: NewsletterPayload
): Promise<NewsletterSubscribeResult> {
  const hookUrl = process.env.ZAPIER_NEWSLETTER_HOOK_URL?.trim();

  if (!hookUrl) {
    return { sent: false, skipped: true, reason: "No Zapier hook configured." };
  }

  // Belt and braces. The caller already checks, but this function must not be
  // the place a "no" becomes a subscription.
  if (!payload.consent.optedIn) {
    return { sent: false, skipped: true, reason: "Customer did not opt in." };
  }

  if (!payload.email.trim()) {
    return { sent: false, skipped: true, reason: "No email address." };
  }

  try {
    const response = await fetch(hookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Zapier acknowledges immediately; anything slower than this is a
      // problem the customer must not wait behind.
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        sent: false,
        skipped: false,
        error: `Zapier returned ${response.status}.`,
      };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Unknown Zapier error.",
    };
  }
}
