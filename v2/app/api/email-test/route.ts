import { NextResponse } from "next/server";

import {
  adminSecretMatches,
  isAdminSecretConfigured,
} from "../../../lib/admin-auth";
import { getEmailProvider, sendQuoteEmail } from "../../../lib/email";

/**
 * GET /api/email-test — sends a sample quote email to prove delivery works.
 *
 * ── WHY THIS IS GUARDED ───────────────────────────────────────────────────
 * It was not, and it SENDS MAIL. A public GET that puts a message in the
 * shop's inbox needs no attacker to become a problem: a GET is what a crawler
 * follows, what a link preview fetches, what a browser prefetches. Anything
 * that discovered this URL sent the shop a quote that was never placed.
 *
 * Driven on purpose it is worse still. The message is built by
 * sendQuoteEmail, so every one looks exactly like a real submission in the
 * inbox — a flood does not read as junk, it reads as orders, and it buries
 * the ones that are. It also spends the provider's quota: a Gmail app
 * password has a daily send limit, and reaching it stops REAL quote delivery
 * until the next day.
 *
 * Not an open relay — the recipient is always QUOTE_TO_EMAIL and cannot be
 * chosen by the caller. The exposure is the shop's own inbox and its send
 * quota, which is enough.
 *
 * Guarded exactly like /api/health: 503 when no ADMIN_SECRET is configured,
 * so it fails closed rather than becoming public again on a deployment that
 * forgot the variable.
 * ──────────────────────────────────────────────────────────────────────────
 */
export async function GET(request: Request) {
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      {
        sent: false,
        error:
          "ADMIN_SECRET is not set, so this endpoint is disabled. It sends real mail.",
      },
      { status: 503 }
    );
  }

  const provided =
    request.headers.get("x-admin-secret") ||
    new URL(request.url).searchParams.get("secret");

  if (!adminSecretMatches(provided)) {
    return NextResponse.json(
      {
        sent: false,
        error: "Unauthorized.",
        hint: "Append ?secret=... or send an x-admin-secret header — the same secret /api/health takes.",
      },
      { status: 401 }
    );
  }

  const provider = getEmailProvider();

  const configured = {
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    GMAIL_USER: Boolean(process.env.GMAIL_USER),
    GMAIL_APP_PASSWORD: Boolean(process.env.GMAIL_APP_PASSWORD),
  };

  const to = process.env.QUOTE_TO_EMAIL || "quote@gorillasalem.com";

  if (!provider) {
    return NextResponse.json(
      {
        sent: false,
        provider: null,
        configured,
        to,
        hint: "No email provider configured. Set RESEND_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD, in v2/.env.local and restart the dev server.",
      },
      { status: 400 }
    );
  }

  const result = await sendQuoteEmail({
    quoteNumber: "GS-EMAIL-TEST",
    receivedAt: new Date().toISOString(),
    order: {
      customer: {
        customerName: "Test Customer",
        company: "Email Test",
        email: "test@example.com",
        phone: "",
        notes: "This is a test send from /api/email-test — not a real quote.",
      },
      product: {
        type: "Custom Stickers",
        quantity: 100,
        size: '3"',
        shape: "Die Cut",
        material: "Gloss White Vinyl",
      },
      production: {
        needBy: "",
        deadlineType: "Flexible",
        deliveryMethod: "Pickup",
      },
      pricing: { stickerPrice: 89, shippingPrice: 0, total: 89 },
    },
    artworkAnalysis: null,
    attachmentInfo: "No file uploaded (test send)",
  });

  return NextResponse.json(
    {
      ...result,
      configured,
      to,
      hint: result.sent
        ? `Sent via ${result.provider}. Check the inbox for ${to} (including spam).`
        : "Send failed — see error. Check the key/password and the from-address rules for your provider.",
    },
    { status: result.sent ? 200 : 400 }
  );
}
