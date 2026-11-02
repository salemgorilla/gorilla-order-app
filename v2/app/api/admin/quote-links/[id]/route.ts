import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../../../lib/admin-auth";
import {
  regenerateLink,
  releasePayment,
  unlockLink,
} from "../../../../../lib/quote-link-service";
import { liveDeps } from "../../../../../lib/quote-link-runtime";
import { SITE_ORIGIN } from "../../../../../lib/unsubscribe-token";

/**
 * POST /api/admin/quote-links/:id   { action: "regenerate" | "unlock" | "release" }
 *
 * Regenerate returns the new URL once and kills the old one - the shop cannot
 * re-copy an existing link because only a hash of the token is kept.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminSecretConfigured()) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET is not set." }, { status: 503 });
  }
  if (!adminSecretMatches(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {}

  const deps = liveDeps();

  if (body.action === "regenerate") {
    const r = await regenerateLink(deps, id);
    return r.ok
      ? NextResponse.json({ ok: true, url: `${SITE_ORIGIN}/q/${r.token}` })
      : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }

  const r =
    body.action === "unlock"
      ? await unlockLink(deps, id)
      : body.action === "release"
      ? await releasePayment(deps, id)
      : null;

  if (!r) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
