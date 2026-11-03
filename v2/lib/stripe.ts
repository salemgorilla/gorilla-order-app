import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe, by its REST API. Two calls and one check - no SDK dependency for
 * that.
 *
 * Keys are read trimmed (AGENTS.md: a pasted secret with a trailing newline
 * is invisible and fails forever). With no key, online payment is OFF and
 * says so; it never falls back to anything else.
 *
 *   STRIPE_SECRET_KEY       sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET   whsec_... for /api/stripe/webhook
 */

const API = "https://api.stripe.com/v1";

export function stripeSecretKey(): string {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim();
}

export function stripeWebhookSecret(): string {
  return (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
}

export function isStripeConfigured(): boolean {
  return stripeSecretKey().length > 0 && stripeWebhookSecret().length > 0;
}

/** Stripe takes form encoding with bracketed keys: line_items[0][quantity]. */
export function formEncode(value: unknown, prefix = "", out: string[] = []): string {
  if (value === undefined || value === null) return out.join("&");

  if (typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);

    for (const [key, v] of entries) {
      formEncode(v, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }

  return out.join("&");
}

async function stripePost<T>(path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: formEncode(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Stripe: ${data?.error?.message ?? `HTTP ${response.status}`}`);
  }

  return data as T;
}

export type CheckoutSessionInput = {
  amountCents: number;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  /** Same key, same session: a double click cannot open two. */
  idempotencyKey: string;
};

export type CheckoutSession = { id: string; url: string };

export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
  const session = await stripePost<{ id: string; url: string }>(
    "/checkout/sessions",
    {
      mode: "payment",
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.metadata.linkId,
      metadata: input.metadata,
      payment_intent_data: { metadata: input.metadata, description: input.description },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: { name: input.description },
          },
        },
      ],
    },
    input.idempotencyKey
  );

  return { id: session.id, url: session.url };
}

/** Close an unpaid session so an outdated price cannot be paid. */
export async function expireCheckoutSession(sessionId: string): Promise<void> {
  try {
    await stripePost(`/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
  } catch (error) {
    // Already expired or completed is fine for an expire; anything else is not.
    const message = error instanceof Error ? error.message : String(error);
    if (!/expired|complete/i.test(message)) throw error;
  }
}

/**
 * Is this webhook body really from Stripe?
 *
 * Stripe-Signature: t=<unix>,v1=<hex hmac of "t.body">. Checked against the
 * RAW body, in constant time, within five minutes so an old event cannot be
 * replayed.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300
): boolean {
  if (!header || !secret) return false;

  const parts = header.split(",").map((p) => p.trim());
  const t = Number(parts.find((p) => p.startsWith("t="))?.slice(2));
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));

  if (!Number.isFinite(t) || !signatures.length) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"),
    "utf8"
  );

  return signatures.some((sig) => {
    const given = Buffer.from(sig, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
