import { NextResponse } from "next/server";

import { handleStripeEvent } from "../../../../lib/quote-link-service";
import { liveDeps } from "../../../../lib/quote-link-runtime";
import { stripeWebhookSecret, verifyStripeSignature } from "../../../../lib/stripe";

/**
 * POST /api/stripe/webhook
 *
 * Point Stripe at https://labs.gorillasalem.com/api/stripe/webhook with the
 * events checkout.session.completed and payment_intent.payment_failed, and
 * put its signing secret in STRIPE_WEBHOOK_SECRET.
 *
 * The signature is checked against the RAW body before anything is parsed.
 * An unsigned or stale request changes nothing. A signed one is answered 200
 * once understood, even if Printavo failed - the payment is recorded and the
 * shop is emailed, and a 5xx would only make Stripe resend it.
 */
export async function POST(request: Request) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Webhook secret not configured." }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ ok: false, error: "Bad signature." }, { status: 400 });
  }

  let event: Parameters<typeof handleStripeEvent>[1];
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON." }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(liveDeps(), event);
    console.log(`STRIPE WEBHOOK ${event.type} ${event.id}: ${result.note}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Storage or another unexpected failure: let Stripe retry.
    console.error(`STRIPE WEBHOOK FAILED ${event.type} ${event.id}:`, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
