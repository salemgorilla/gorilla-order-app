import { NextResponse } from "next/server";

import { findDiscountCode } from "../../../lib/discount-codes";

/**
 * "Is this code good?" — the only thing the browser can ask about codes.
 *
 * The list never leaves the server; the browser sends one code and gets
 * back that code's discount or nothing. Submit does NOT trust the answer:
 * repriceStickers looks the code up again from the payload, so a browser
 * that fabricates `{ kind: "percent", percent: 90 }` is repriced at list.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const discount = findDiscountCode(body.code);
  if (!discount) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, discount });
}
