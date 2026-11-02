import { NextResponse } from "next/server";

import { toPublicQuote } from "../../../../../lib/quote-link";
import { updateSizes } from "../../../../../lib/quote-link-service";
import { liveDeps } from "../../../../../lib/quote-link-runtime";
import { guard, readJson } from "../../_guard";

/** POST /api/q/:token/sizes - reprice on the server and return the breakdown. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const blocked = guard(request, token, "sizes", 120);
  if (blocked) return blocked;

  const body = await readJson(request);
  if (!body) return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });

  const result = await updateSizes(liveDeps(), token, body.sizes);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    quote: toPublicQuote(result.link),
    warnings: result.warnings,
  });
}
