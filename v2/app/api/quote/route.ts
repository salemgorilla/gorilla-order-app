import { NextResponse } from "next/server";

function generateQuoteNumber() {
  const now = new Date();

  const dateStamp = now
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const randomCode = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `GS-${dateStamp}-${randomCode}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const order = body.order ?? body;
    const artworkAnalysis = body.artworkAnalysis ?? null;

    const quoteNumber = generateQuoteNumber();
    const receivedAt = new Date().toISOString();

    const quoteRecord = {
      quoteNumber,
      receivedAt,
      status: "received",
      customer: order.customer,
      product: order.product,
      production: order.production,
      pricing: order.pricing,
      artworkAnalysis,
      internalNotes: [
        "This quote was generated from the Gorilla Order app.",
        "Uploaded artwork file contents are not stored yet. Only browser-side analysis is included.",
        "Next step: connect this quote record to email, Google Sheets, Shopify, Printavo, or a database.",
      ],
    };

    console.log("GORILLA SALEM QUOTE REQUEST");
    console.log(JSON.stringify(quoteRecord, null, 2));

    return NextResponse.json({
      success: true,
      message: "Quote received by Gorilla Salem.",
      quoteNumber,
      receivedAt,
      quote: quoteRecord,
    });
  } catch (error) {
    console.error("QUOTE API ERROR");
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to receive quote request.",
      },
      { status: 500 }
    );
  }
}
