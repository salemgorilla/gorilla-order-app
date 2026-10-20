import {
  isSubscriberStoreConfigured,
  subscriberStore,
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
 * The list now lives in the shop's own storage (lib/subscribers.ts): a Google
 * Doc in the shop's own Google account when one is configured, a private blob
 * store otherwise. No mailing service holds it, which is what keeps the line
 * the confirmation email has carried since 9 Sep — "we will not sell your
 * information" — true by construction rather than by policy. There is no
 * mechanism in this app that hands a subscriber to anyone else.
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
    ? subscriberStore()
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

/**
 * HOW LONG A SIGN-UP MAY HOLD THE SHOP'S EMAIL.
 *
 * subscribeToNewsletter used to run AFTER the shop email and the Printavo
 * quote, so a slow blob store could only ever delay the response. It now
 * runs BEFORE the email, so that the email can say what happened — and that
 * moves it onto the path that gets an order to the shop.
 *
 * Which makes a deadline mandatory, not tidy. lib/blob-health.ts measured
 * this SDK against a black-holed network: `list` with AbortSignal.timeout(3000)
 * had not returned 45 seconds later, because it retries a network error ten
 * times. A marketing list must not be able to stop a paid order reaching the
 * shop, so the race is enforced here, in code this file controls.
 *
 * Four seconds: far longer than a healthy read and write of one small
 * record, short enough that a dead store costs the shop's email a moment
 * rather than the order.
 */
export const NEWSLETTER_DEADLINE_MS = 4_000;

export const NEWSLETTER_TIMEOUT_MESSAGE =
  "The newsletter store did not answer in time.";

/**
 * subscribeToNewsletter, bounded. Never rejects, never outlasts `ms`.
 *
 * The losing promise is left to settle by itself: there is nothing to clean
 * up, and letting it reject unhandled would take the process down, so
 * `.catch(() => {})` is the whole cleanup.
 */
export async function subscribeWithin(
  payload: NewsletterPayload,
  ms: number = NEWSLETTER_DEADLINE_MS,
  injectedStore?: SubscriberStore
): Promise<NewsletterSubscribeResult> {
  const work = subscribeToNewsletter(payload, injectedStore);
  work.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<NewsletterSubscribeResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({ sent: false, skipped: false, error: NEWSLETTER_TIMEOUT_MESSAGE }),
      ms
    );
    // Deliberately NOT unref'd. The deadline is the thing that guarantees
    // progress, so it must be able to fire; and it cannot hold anything open
    // past its use, because the `finally` below clears it the moment the race
    // settles. (An unref'd timer is also invisible to the event loop, which
    // is how the first version of this stalled its own test.)
  });

  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    // subscribeToNewsletter is written never to throw. If it ever does, the
    // rule at the top of this file still holds: it must not reach the quote.
    return {
      sent: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Unknown newsletter error.",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The sentence for the shop email when a sign-up did not land, or null when
 * it did. One place so the log line and the email row can never disagree
 * about why.
 */
export function newsletterGap(result: NewsletterSubscribeResult): string | null {
  if (result.sent) return null;

  const why = "reason" in result ? result.reason : result.error;

  // Trailing punctuation off: the row appends its own full stop.
  return String(why || "no reason given").replace(/[.\s]+$/, "");
}
