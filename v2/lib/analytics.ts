/**
 * THE FUNNEL — THE PART THE SERVER LOG CANNOT SEE.
 *
 * ── WHAT THIS ADDS THAT lib/submission-log.ts DOES NOT ────────────────────
 * That file gives the shop one countable line per SUBMISSION. It answers
 * everything about the people who pressed the button and nothing at all
 * about the people who did not, because this app is entirely client-side
 * until submit: somebody can open it, pick stickers, configure a run, read
 * an estimate and close the tab, and the server never hears a word.
 *
 * "How many people reached an estimate?" was one of the four questions the
 * last three weeks kept running into, and it is the one the log line
 * cannot answer. Five events can.
 *
 * ── IT SHIPS DARK ─────────────────────────────────────────────────────────
 * Vercel Web Analytics is a per-project toggle in the dashboard. Until Gabe
 * turns it on, the <Analytics /> component's script is not served and these
 * calls go nowhere — no data is collected, no cookie is set, nothing to
 * consent to. Adding the code and enabling the collection are deliberately
 * two separate acts, and the second one is the shop's.
 *
 * ── FIVE EVENTS, AND THE SHAPES ARE THE POINT ─────────────────────────────
 * The failure mode of any analytics wrapper is that it takes a name and a
 * bag of properties, so the first person in a hurry sends the customer's
 * email as `user`. Here every event is a named union member with named
 * fields, so there is no bag to put one in, and `send()` re-checks the
 * values at runtime — a type is a promise to the compiler, not to a
 * customer.
 *
 * ── NO PII, AND NO EXACT MONEY EITHER ─────────────────────────────────────
 * No name, no email, no filename, no notes, no quote number. The quote
 * number is deliberately absent even though the log line carries it: there
 * it is a key to the shop's own Printavo record, here it would be a key
 * handed to a third party that could join a browsing session to a person.
 *
 * Totals are sent as a BAND, not a figure. "Did they reach an estimate, and
 * roughly how big" is the question; the exact total is money, it is already
 * in Printavo and in the server log, and a per-cent figure is close enough
 * to unique on a big order to identify the order it came from.
 *
 * ── THE UPLOAD REASON IS CLASSIFIED, NEVER FORWARDED ──────────────────────
 * lib/artwork-upload.ts produces a free-text failure from the SDK's own
 * error, which is right for the shop email and wrong here: it can carry a
 * store id or a signed URL. classifyUploadFailure() maps it onto five
 * words. An enum cannot leak.
 */

import { track } from "@vercel/analytics";

export type AnalyticsFlow = "stickers" | "signs" | "banners" | "apparel";

/** Coarse enough to be safe, fine enough to be worth counting. */
export type EstimateBand =
  | "under_100"
  | "100_500"
  | "500_1500"
  | "1500_5000"
  | "over_5000";

export type UploadFailureKind =
  | "too_large"
  | "no_store"
  | "timeout"
  | "network"
  | "unknown";

export type AnalyticsEvent =
  /** They picked a product and the configurator opened. */
  | { name: "product_selected"; flow: AnalyticsFlow }
  /** They arrived at a step. `step` is a StepId — orientation, not content. */
  | { name: "step_reached"; flow: AnalyticsFlow; step: string }
  /** A priced figure existed on screen. The one the server cannot see. */
  | { name: "estimate_shown"; flow: AnalyticsFlow; band: EstimateBand }
  /** The quote was accepted by the route. */
  | { name: "submit_ok"; flow: AnalyticsFlow; door: "priced" | "special" }
  /** A direct upload fell back to the form path, and why. */
  | { name: "upload_failed"; flow: AnalyticsFlow; reason: UploadFailureKind };

/**
 * Which fields each event is allowed to carry. Read at RUNTIME, so a value
 * that reaches send() by any route — a cast, a JSON payload, a future
 * caller written in a hurry — is dropped rather than sent.
 */
const ALLOWED: Record<AnalyticsEvent["name"], string[]> = {
  product_selected: ["flow"],
  step_reached: ["flow", "step"],
  estimate_shown: ["flow", "band"],
  submit_ok: ["flow", "door"],
  upload_failed: ["flow", "reason"],
};

/**
 * The last line of defence, and it is deliberately blunt.
 *
 * Every legitimate value in every event above is a short lowercase token —
 * a flow, a step id, a band, a door, a classified reason. Anything with an
 * "@", a dot, a slash, a space or any length to it is not one of those, and
 * whatever it IS, it is not worth the risk of sending. Refused rather than
 * trimmed: a truncated email is still an email.
 */
const SAFE_VALUE = /^[a-z0-9_]{1,32}$/;

function isSafe(value: unknown): value is string {
  return typeof value === "string" && SAFE_VALUE.test(value);
}

/** A figure to a band. Boundaries are inclusive at the bottom. */
export function estimateBand(total: number): EstimateBand {
  const amount = Number(total) || 0;

  if (amount < 100) return "under_100";
  if (amount < 500) return "100_500";
  if (amount < 1500) return "500_1500";
  // The ceiling this app already thinks in: FULL_PAYMENT_CEILING is
  // $4,999.99, above which an order takes a deposit instead of the whole
  // amount (lib/auto-bill.ts). A band boundary in the same place means the
  // count of deposit-sized quotes is readable straight off the chart.
  if (amount <= 4999.99) return "1500_5000";
  return "over_5000";
}

/**
 * The SDK's sentence to one of five words.
 *
 * Matched on substrings rather than parsed: the text comes from whichever
 * layer failed — our own 100 MB check, the token route's 501, an aborted
 * stall timer, or the platform's fetch — and it has changed shape before.
 * An unrecognised failure counts as "unknown", which is a real answer.
 */
export function classifyUploadFailure(failure: string): UploadFailureKind {
  const text = String(failure || "").toLowerCase();

  if (!text) return "unknown";
  if (text.includes("exceeds") || text.includes("too large")) return "too_large";
  if (
    text.includes("not configured") ||
    text.includes("does not exist") ||
    text.includes("501")
  ) {
    return "no_store";
  }
  if (text.includes("timed out") || text.includes("timeout") || text.includes("abort")) {
    return "timeout";
  }
  if (text.includes("fetch") || text.includes("network") || text.includes("failed to")) {
    return "network";
  }

  return "unknown";
}

/**
 * Send one event, or send nothing.
 *
 * Never throws and never awaits: an analytics call that can break a step
 * transition is a worse bug than no analytics at all. The whole body is
 * wrapped, because `track` reaches into the page and a blocked script, an
 * extension, or a browser with storage disabled can all make it raise.
 */
export function sendAnalyticsEvent(event: AnalyticsEvent): void {
  try {
    if (typeof window === "undefined") return;

    const allowed = ALLOWED[event.name];
    if (!allowed) return;

    const properties: Record<string, string> = {};

    for (const key of allowed) {
      const value = (event as unknown as Record<string, unknown>)[key];
      if (!isSafe(value)) return; // A malformed event is not sent at all.
      properties[key] = value;
    }

    track(event.name, properties);
  } catch {
    // Deliberately silent. There is nothing a customer mid-quote can do
    // about it, and a console.error here would be noise on every page view
    // in a browser with tracking blocked — which is most of them.
  }
}
