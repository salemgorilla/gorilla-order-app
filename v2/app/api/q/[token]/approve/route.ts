import { NextResponse } from "next/server";

import { toPublicQuote } from "../../../../../lib/quote-link";
import { approveLink } from "../../../../../lib/quote-link-service";
import { liveDeps } from "../../../../../lib/quote-link-runtime";
import { requestKey } from "../../../../../lib/rate-limit";
import { guard, readJson } from "../../_guard";

/** POST /api/q/:token/approve - recompute, snapshot, lock. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const blocked = guard(request, token, "approve", 20);
  if (blocked) return blocked;

  const body = await readJson(request);
  if (!body) return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });

  const result = await approveLink(liveDeps(), token, {
    name: body.name,
    email: body.email,
    agreed: body.agreed,
    sizes: body.sizes,
    ip: requestKey(request),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, quote: toPublicQuote(result.link) });
}
