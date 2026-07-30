import { NextResponse } from "next/server";

import { getEmailProvider, sendQuoteEmail } from "../../../lib/email";

// GET /api/email-test
// Sends a harmless sample quote email so you can confirm delivery works.
export async function GET() {
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
