import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../lib/admin-auth";
import { createPaymentRequest } from "../../../lib/printavo";

/**
 * POST /api/payment-request
 *
 * Asks a customer to pay for a Printavo quote. This is a MONEY action, so:
 *  - it is never triggered automatically by a customer submission
 *  - it requires the ADMIN_SECRET, so only the shop can call it
 *
 * Body: { quoteId, amount?, to?, subject?, body? }
 * Header: x-admin-secret: <ADMIN_SECRET>
 */
export async function POST(request: Request) {
  // Fail closed: with no secret configured the endpoint is unusable rather
  // than open to the world. A whitespace-only value counts as unset — see
  // lib/admin-auth.
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      {
        sent: false,
        error:
          "ADMIN_SECRET is not set. Payment requests are disabled until it is configured.",
      },
      { status: 503 }
    );
  }

  if (!adminSecretMatches(request.headers.get("x-admin-secret"))) {
    return NextResponse.json(
      { sent: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { sent: false, error: "Expected a JSON body." },
      { status: 400 }
    );
  }

  const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
  if (!quoteId) {
    return NextResponse.json(
      { sent: false, error: "quoteId is required." },
      { status: 400 }
    );
  }

  const result = await createPaymentRequest({
    quoteId,
    amount: typeof body.amount === "number" ? body.amount : undefined,
    to: Array.isArray(body.to) ? (body.to as string[]) : undefined,
    subject: typeof body.subject === "string" ? body.subject : undefined,
    body: typeof body.body === "string" ? body.body : undefined,
  });

  if (result.sent) {
    console.log(
      `PAYMENT REQUEST SENT for quote ${quoteId}: $${result.amount} (${result.visualId})`
    );
  } else {
    console.error(
      `PAYMENT REQUEST FAILED for quote ${quoteId}: ${result.error}`
    );
  }

  return NextResponse.json(result, { status: result.sent ? 200 : 400 });
}
