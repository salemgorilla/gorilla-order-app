import { NextResponse } from "next/server";

import { getConfigHealth } from "../../../lib/config-health";

/**
 * What this deployment can and cannot do right now.
 *
 * Admin-guarded, and fails closed with no ADMIN_SECRET, for the same reason
 * as the payment-request route: the answer names which integrations are dark,
 * which is a shopping list for anyone probing the site.
 *
 * Reports capabilities, never values. Whether a secret is SET is operational
 * fact the shop needs; what it is set TO is not something this endpoint will
 * ever say, however convenient that would be for debugging.
 */
export async function GET(request: Request) {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ADMIN_SECRET is not set, so this check is disabled. Set it to use /api/health.",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);

  // Header or query string. The query string is there because this gets read
  // on a phone, from a message, by someone who is not going to craft a curl.
  const provided =
    request.headers.get("x-admin-secret") || url.searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const health = getConfigHealth();

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV || "development",
    needsAttention: health.needsAttention,
    capabilities: health.capabilities,
  });
}
