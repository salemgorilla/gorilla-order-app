import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../../lib/admin-auth";
import { createLink } from "../../../../lib/quote-link-service";
import { catalogSizesFor, liveDeps } from "../../../../lib/quote-link-runtime";
import { isQuoteLinkStoreConfigured } from "../../../../lib/quote-link-blob";
import { SITE_ORIGIN } from "../../../../lib/unsubscribe-token";

function denied(request: Request) {
  if (!isAdminSecretConfigured()) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET is not set." }, { status: 503 });
  }
  if (!adminSecretMatches(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isQuoteLinkStoreConfigured()) {
    return NextResponse.json({ ok: false, error: "No blob store is configured." }, { status: 503 });
  }
  return null;
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET - the shop's list of links (no tokens: those are shown once, at creation). */
export async function GET(request: Request) {
  const blocked = denied(request);
  if (blocked) return blocked;

  const links = await liveDeps().store.listLinks();

  return NextResponse.json({
    ok: true,
    links: links.map((l) => ({
      id: l.id,
      order: l.printavo.visualId,
      customer: l.customer.name,
      status: l.status,
      createdAt: l.createdAt,
      held: l.status === "approved" && !l.paymentReleased,
      total: l.approvedSnapshot?.total,
    })),
  });
}

/** POST - create a link for a Printavo quote. Returns the URL once. */
export async function POST(request: Request) {
  const blocked = denied(request);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  const style = text(body.style, 40);
  const colorName = text(body.colorName, 60);
  const locations = Array.isArray(body.printLocations)
    ? body.printLocations.map((l) => text(l, 40)).filter(Boolean).slice(0, 8)
    : [];

  if (!text(body.printavoQuote, 30) || !style || !colorName) {
    return NextResponse.json(
      { ok: false, error: "Quote number, style and colour are required." },
      { status: 400 }
    );
  }

  const catalog = await catalogSizesFor(style, colorName);
  if (!catalog.ok) return NextResponse.json({ ok: false, error: catalog.error }, { status: 400 });

  const depositRaw = body.depositPercent;
  const deposit =
    depositRaw === null || depositRaw === undefined || depositRaw === ""
      ? null
      : Number(depositRaw);

  const result = await createLink(liveDeps(), {
    printavoQuote: text(body.printavoQuote, 30),
    catalogSizes: catalog.sizes,
    minimumPieces: Number(body.minimumPieces) || 24,
    depositPercent: deposit,
    turnaroundNote: text(body.turnaroundNote, 300),
    spec: {
      brand: catalog.brand,
      styleLabel: `${catalog.brand} ${style}`,
      catalogStyle: style,
      colorName,
      imageUrl: catalog.imageUrl,
      method: text(body.method, 60) || "Screen print",
      printLocations: locations,
      inkColors: text(body.inkColors, 20) || "1 color",
      hasUnderbase: body.hasUnderbase === true,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    id: result.link.id,
    url: `${SITE_ORIGIN}/q/${result.token}`,
  });
}
