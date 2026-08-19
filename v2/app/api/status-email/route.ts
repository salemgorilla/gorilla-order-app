import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../lib/admin-auth";
import { sendCustomerEmail } from "../../../lib/email";
import { lookupOrderStatus } from "../../../lib/printavo";
import { buildStatusEmail } from "../../../lib/status-email";

/**
 * "Your order is ready" — the one message the shop actually owes a customer.
 *
 * ── WHAT THIS CLOSES ──────────────────────────────────────────────────────
 * Nothing in this app has ever told a customer their order moved. /track is
 * pull-only: they have to come to the site and type their number. A walk-in
 * who paid in full at the counter had no way of learning their order was
 * waiting for them except by ringing up.
 *
 * ── WHY IT TAKES THE EMAIL RATHER THAN LOOKING IT UP ──────────────────────
 * It calls lookupOrderStatus, which matches on quote number AND email and is
 * the query already proven against the live account. So this endpoint can
 * only ever send to an address that ALREADY belongs to the order — it cannot
 * be pointed at a different one, and it needs no new Printavo query written
 * from a schema nobody has run.
 *
 * The cost is that the caller supplies the address. That is the right trade
 * for a shop tool: staff has the order open in front of them.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * It is not the trigger. Nothing here watches Printavo for a status change —
 * see the note in HANDOFF. This is the half that can be built and checked
 * without Printavo credentials; wiring a schedule to it is one HTTP call.
 * ──────────────────────────────────────────────────────────────────────────
 */
export async function POST(request: Request) {
  // Admin-guarded, and fails closed with no ADMIN_SECRET — the same rule as
  // /api/health. This sends mail to customers; it is not a public endpoint.
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_SECRET is not set, so this endpoint is disabled." },
      { status: 503 }
    );
  }

  const provided =
    request.headers.get("x-admin-secret") ||
    new URL(request.url).searchParams.get("secret");

  if (!adminSecretMatches(provided)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let quoteNumber = "";
  let email = "";
  let customerName = "";

  try {
    const body = await request.json();
    quoteNumber = String(body?.quoteNumber ?? "").trim();
    email = String(body?.email ?? "").trim();
    customerName = String(body?.customerName ?? "").trim();
  } catch {
    // A malformed body is a bad request, not a server error.
  }

  if (!quoteNumber || !email) {
    return NextResponse.json(
      { ok: false, error: "quoteNumber and email are both required." },
      { status: 400 }
    );
  }

  const found = await lookupOrderStatus({ quoteNumber, email });

  if (!found.found) {
    // Printavo being unreachable is NOT the same as no such order, and a
    // caller deciding whether to retry needs to be able to tell them apart.
    const unavailable = found.reason === "unavailable";

    return NextResponse.json(
      {
        ok: false,
        reason: found.reason,
        error: unavailable
          ? "Could not reach Printavo."
          : "No order matches that number and email.",
      },
      { status: unavailable ? 503 : 404 }
    );
  }

  const message = buildStatusEmail({
    quoteNumber: found.quoteNumber,
    printavoStatus: found.status,
    customerName,
  });

  if (!message.send) {
    // A deliberate no-send is a success, not a failure: most status changes
    // are not worth an email and the caller should not retry them.
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: message.reason,
      status: found.status,
    });
  }

  const result = await sendCustomerEmail({
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (!result.sent) {
    console.error(
      `STATUS EMAIL FAILED for ${found.quoteNumber}: ${result.error ?? "no email provider configured"}`
    );
  }

  return NextResponse.json({
    ok: result.sent,
    sent: result.sent,
    status: found.status,
    subject: message.subject,
    error: result.sent ? undefined : result.error,
  });
}
