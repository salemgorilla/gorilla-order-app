import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../../lib/admin-auth";
import { apparelCatalogStyles } from "../../../../lib/apparel-catalog";
import { addDays, shopDay } from "../../../../lib/order-usage";
import {
  isUsageTrackingEnabled,
  loadUsageDays,
  readLearnedRanking,
  rebuildLearnedRanking,
  vercelUsageStore,
} from "../../../../lib/order-usage-store";
import { fetchSsActivewearCatalog } from "../../../../lib/ss-activewear";
import { buildUsageReport } from "../../../../lib/usage-report";

/**
 * GET /api/usage/report — what the weekly review reads.
 *
 *   ?days=7          the period, ending today (1–31). The report puts it
 *                    beside the same number of days before it.
 *   ?end=YYYY-MM-DD  end the period on another shop day instead.
 *   ?rebuild=1       roll up and rebuild the learned colour order first.
 *
 * ── WHO CAN READ IT ───────────────────────────────────────────────────────
 * The shop. Either key works, as a header or in the query string:
 *
 *   USAGE_REPORT_KEY  x-usage-key header, or ?key=      READ-ONLY. This is the
 *                     one to give a scheduled review: it opens this report
 *                     and nothing else, so a routine never has to hold
 *                     ADMIN_SECRET, which also guards payment requests.
 *   ADMIN_SECRET      x-admin-secret header, or ?secret=
 *
 * There is nothing personal in the report (lib/order-usage.ts), but there
 * are the shop's sales numbers and quote numbers, so it is not public.
 */
export const dynamic = "force-dynamic";

function reportKey(): string {
  return (process.env.USAGE_REPORT_KEY ?? "").trim();
}

function reportKeyMatches(provided: string | null): boolean {
  const expected = reportKey();
  if (!expected || !provided) return false;
  const left = Buffer.from(provided.trim(), "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!reportKey() && !isAdminSecretConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Neither USAGE_REPORT_KEY nor ADMIN_SECRET is set, so nobody can read this." },
      { status: 503 }
    );
  }

  const key = request.headers.get("x-usage-key") || url.searchParams.get("key");
  const secret = request.headers.get("x-admin-secret") || url.searchParams.get("secret");

  if (!reportKeyMatches(key) && !adminSecretMatches(secret)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized.",
        hint: "Send USAGE_REPORT_KEY as an x-usage-key header (or ?key=), or ADMIN_SECRET as x-admin-secret (or ?secret=).",
      },
      { status: 401 }
    );
  }

  if (!isUsageTrackingEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Usage tracking is off: USAGE_TRACKING is set to off, or there is no blob store.",
      },
      { status: 503 }
    );
  }

  const days = Math.min(31, Math.max(1, Math.floor(Number(url.searchParams.get("days")) || 7)));
  const endParam = url.searchParams.get("end") || "";
  const end = DAY.test(endParam) ? endParam : shopDay();
  const from = addDays(end, -(days - 1));
  const previousEnd = addDays(from, -1);
  const previousFrom = addDays(previousEnd, -(days - 1));

  const store = vercelUsageStore();

  try {
    const ranking =
      url.searchParams.get("rebuild") === "1"
        ? await rebuildLearnedRanking(store)
        : await readLearnedRanking(store);

    const [current, previous] = await Promise.all([
      loadUsageDays(store, from, end),
      loadUsageDays(store, previousFrom, previousEnd),
    ]);

    // The colour names per garment, so the report can show the top twelve as
    // a customer sees them today. Optional: without S&S it reports the rest.
    let catalogColors: Record<string, string[]> | undefined;
    try {
      const catalog = await fetchSsActivewearCatalog(apparelCatalogStyles);
      catalogColors = Object.fromEntries(
        catalog.products.map((product) => [
          product.catalogStyle,
          product.colors.map((color) => color.colorName),
        ])
      );
    } catch {
      catalogColors = undefined;
    }

    return NextResponse.json({
      ok: true,
      ...buildUsageReport({ current, previous, ranking, catalogColors }),
      rankingBuiltAt: ranking?.builtAt ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not read usage: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 502 }
    );
  }
}
