import {
  isSubscriberStoreConfigured,
  vercelSubscriberStore,
} from "./subscriber-store";
import { recordSubscription, type SubscriberStore } from "./subscribers";
import type { NewsletterConsent } from "../types/order";

/**
 * Newsletter sign-ups, kept by the shop.
 *
 * ── WHAT THIS USED TO BE ──────────────────────────────────────────────────
 * A POST to a Zapier catch hook, which handed the contact to Constant
 * Contact. Gabe, 2026-09-10: "I quit constant contact." The hook is gone,
 * and with it the only place a subscriber was ever stored — this app kept
 * nothing of its own, so a customer could tick the box, the shop email could
 * say "Opted in", and the record existed nowhere either party controlled.
 *
 * The list now lives in the shop's own blob store (lib/subscribers.ts). No
 * third party holds it, which is what makes the line the confirmation email
 * has carried since 9 Sep — "we will not sell your information" — true by
 * construction rather than by policy. There is no longer a mechanism in this
 * app that hands a subscriber to anyone.
 *
 * ── THE RULE THIS FILE EXISTS TO HOLD ─────────────────────────────────────
 * A newsletter sign-up must NEVER affect the quote. It is a marketing nicety
 * bolted to the side of the flow that takes money. Every failure here is
 * swallowed: no throw, no retry storm, no bearing on what the customer is
 * told about their order. If the store is unreachable the shop loses one
 * subscriber and the customer never knows.
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

/**
 * Is there anywhere for a sign-up to GO?
 *
 * The dangerous kind of "off": with nowhere to keep the list, a customer
 * ticks the box, the shop's email says "Opted in", the consent record is
 * written, and nobody is on any list. Nothing is broken anywhere; nothing is
 * happening either. lib/config-health.ts reports it on the admin health
 * page, which nobody reads on an ordinary Tuesday — so the shop email says
 * it too, on the line where the claim is made.
 *
 * The question used to be "is the Zapier hook set". It is now "is there a
 * blob store", which is the same question about the shop's own storage.
 */
export function isNewsletterConfigured(): boolean {
  return isSubscriberStoreConfigured();
}

export async function subscribeToNewsletter(
  payload: NewsletterPayload,
  injectedStore?: SubscriberStore
): Promise<NewsletterSubscribeResult> {
  // Injected so the logic can be driven against a Map. The Vercel SDK talks
  // through undici's fetch rather than the global one, so a test that stubs
  // globalThis.fetch does not intercept it — it hangs. See lib/blob-health.
  const store: SubscriberStore | null = injectedStore
    ? injectedStore
    : isSubscriberStoreConfigured()
    ? vercelSubscriberStore()
    : null;

  if (!store) {
    return {
      sent: false,
      skipped: true,
      reason: "No subscriber store configured.",
    };
  }

  // Belt and braces. The caller already checks, but this function must not be
  // the place a "no" becomes a subscription.
  if (!payload.consent.optedIn) {
    return { sent: false, skipped: true, reason: "Customer did not opt in." };
  }

  if (!payload.email.trim()) {
    return { sent: false, skipped: true, reason: "No email address." };
  }

  const outcome = await recordSubscription(
    {
      email: payload.email,
      name: payload.name,
      company: payload.company,
      heardAbout: payload.heardAbout,
      // The phone number is deliberately NOT persisted. It rides in the
      // payload because the shop email and Printavo want it; a marketing
      // list has no use for it, and PII kept without a use is PII kept for
      // a breach.
      source: payload.consent.source,
      preChecked: payload.consent.preChecked === true,
      quoteNumber: payload.quoteNumber,
      // The SERVER's timestamp, taken at submit. A time the browser supplied
      // would be worth nothing as a consent record.
      at: payload.consent.at,
    },
    store
  );

  if (!outcome.stored) {
    return { sent: false, skipped: false, error: outcome.reason };
  }

  if (outcome.suppressed) {
    /**
     * They unsubscribed before, and a PRE-TICKED box has just opted them in
     * again. Not honoured — see lib/subscribers.ts. The second time somebody
     * is added to a list they left, they do not unsubscribe again, they
     * press "spam", and Gmail throttles a sending domain at a complaint rate
     * of three people in a thousand.
     */
    return {
      sent: false,
      skipped: true,
      reason: "Previously unsubscribed — not re-added. Ask them directly.",
    };
  }

  return { sent: true };
}
