import { NextResponse } from "next/server";

import { startPayment } from "../../../../../lib/quote-link-service";
import { liveDeps } from "../../../../../lib/quote-link-runtime";
import { guard } from "../../_guard";

/**
 * POST /api/q/:token/checkout
 *
 * Asks Printavo to email the customer their payment link. Held when the
 * customer changed sizes - see paymentGate in lib/quote-link.ts.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const blocked = guard(request, token, "checkout", 10);
  if (blocked) return blocked;

  const result = await startPayment(liveDeps(), token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, amount: result.amount, emailedTo: result.emailedTo });
}
