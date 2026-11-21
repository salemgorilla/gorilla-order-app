import { NextResponse } from "next/server";

import { MAX_BEACON_BYTES, parseUsagePost } from "../../../lib/order-usage";
import {
  isUsageTrackingEnabled,
  recordVisit,
  vercelUsageStore,
} from "../../../lib/order-usage-store";
import { rateLimited, requestKey } from "../../../lib/rate-limit";

/**
 * POST /api/usage — one page visit's picks and funnel steps.
 *
 * Sent by lib/usage-beacon.ts with navigator.sendBeacon, which never reads
 * the answer, so every outcome is a bare status and nothing in the body
 * matters. What is KEPT is decided by parseUsagePost(): closed lists and
 * short names only, nothing about the visitor (lib/order-usage.ts).
 *
 * The caller's address is used for the throttle and for nothing else. It is
 * held in memory for a minute (lib/rate-limit.ts) and never written down.
 */
export const dynamic = "force-dynamic";

const PER_MINUTE = 30;

export async function POST(request: Request) {
  if (!isUsageTrackingEnabled()) return new NextResponse(null, { status: 204 });

  if (rateLimited("usage", requestKey(request), PER_MINUTE)) {
    return new NextResponse(null, { status: 429 });
  }

  let text = "";
  try {
    text = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (text.length > MAX_BEACON_BYTES) return new NextResponse(null, { status: 413 });

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const beacons = parseUsagePost(body);
  if (beacons.length === 0) return new NextResponse(null, { status: 204 });

  try {
    await recordVisit(vercelUsageStore(), beacons);
    // Previews only: one line per visit is how a preview proves the path
    // works end to end. Production stays quiet; its proof is the report.
    if (process.env.VERCEL_ENV !== "production") {
      console.log(
        `USAGE RECORDED: ${beacons
          .map((b) => `${b.flow} steps=${b.steps.join(",") || "-"} picks=${b.picks.length}`)
          .join(" | ")}`
      );
    }
  } catch (error) {
    // Counting failed; the customer is unaffected. One line, no payload.
    console.error(
      "USAGE NOT RECORDED:",
      error instanceof Error ? error.message : String(error)
    );
  }

  return new NextResponse(null, { status: 204 });
}
