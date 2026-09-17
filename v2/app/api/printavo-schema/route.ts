import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../lib/admin-auth";
import { describePrintavoSchema } from "../../../lib/printavo";

/**
 * "Does the API have X?" — asked of the live account, answered from its schema.
 *
 * Admin-guarded and fails closed, like /api/health: what a shop's integration
 * can and cannot do is not something to publish.
 *
 * Schema ONLY. It returns mutation names, query names, and the field names of
 * types you name. It cannot return an order, a customer, a price or a payment
 * — see describePrintavoSchema for why this is a third fixed query rather
 * than the arbitrary-GraphQL endpoint PRINTAVO-PROBE.md refuses.
 *
 *   /api/printavo-schema?secret=…&type=QuoteCreateInput&type=InvoiceCreateInput
 */
export async function GET(request: Request) {
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_SECRET is not set, so this probe is disabled." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const provided = request.headers.get("x-admin-secret") || url.searchParams.get("secret");

  if (!adminSecretMatches(provided)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const result = await describePrintavoSchema(url.searchParams.getAll("type"));

  // A filter, so the answer to "is there an invoice mutation" is not a
  // hundred names to read on a phone. Substring, case-insensitive.
  const like = (url.searchParams.get("like") || "").trim().toLowerCase();

  if (result.ok && like) {
    return NextResponse.json({
      ...result,
      mutations: result.mutations?.filter((name: string) => name.toLowerCase().includes(like)),
      queries: result.queries?.filter((name: string) => name.toLowerCase().includes(like)),
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
