import { NextResponse } from "next/server";

import { isValidQuoteToken } from "../../../lib/quote-link";
import { rateLimited, requestKey } from "../../../lib/rate-limit";

/** Public, token-gated endpoints: shape check and per-IP throttle, in one place. */
export function guard(request: Request, token: string, bucket: string, max: number) {
  if (rateLimited(`q-${bucket}`, requestKey(request), max)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Give it a minute." },
      { status: 429 }
    );
  }

  // Same answer for a malformed and an unknown token: no oracle.
  if (!isValidQuoteToken(token)) {
    return NextResponse.json({ ok: false, error: "This link is no longer valid." }, { status: 404 });
  }

  return null;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
