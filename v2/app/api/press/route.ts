import { NextResponse } from "next/server";

import { adminSecretMatches } from "../../../lib/admin-auth";
import { fetchRecentInvoicesForPress } from "../../../lib/printavo";
import {
  describePressActivity,
  summarisePressActivity,
} from "../../../lib/press-activity";

/**
 * What the shop actually printed this week — one line, for the hero.
 *
 * Gabe, 2026-09-07, choosing this over a randomised headline: "Make it real
 * rather than random."
 *
 * ── PUBLIC RESPONSE CARRIES COUNTS AND NOTHING ELSE ───────────────────────
 * `{ line: "1,240 stickers · 96 garments · 45 signs" }`, or `{ line: null }`.
 * No customer, no job, no money — see lib/press-activity.ts, which is where
 * that is enforced and tested. A caller learns how busy the shop is, which is
 * the point, and nothing about who it was busy for.
 *
 * ── CACHED, BECAUSE THE HERO IS EVERY VISIT ───────────────────────────────
 * Without a cache this would call Printavo once per page load. The window is
 * a week; a fifteen-minute cache is indistinguishable to a reader and turns
 * unbounded traffic into four calls an hour. Held in module scope: it is per
 * instance rather than global, which is imprecise and completely sufficient —
 * the worst case is a few more calls than strictly needed.
 *
 * ── AND IT FAILS QUIETLY ──────────────────────────────────────────────────
 * Every failure returns `{ line: null }` with a 200. The hero treats absence
 * and a quiet week identically, so an outage at Printavo costs the page
 * nothing. A 500 here would be a broken-looking hero for a decoration.
 */
export const dynamic = "force-dynamic";

const CACHE_MS = 15 * 60 * 1000;

let cached: { line: string | null; at: number } | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") || request.headers.get("x-admin-secret") || "";

  /**
   * The probe. `createdAt` and the line-item field names on a READ are the
   * one part of this that has not been proven against the live account, and
   * the house rule is that Printavo shapes are confirmed rather than guessed
   * (see the note above lookupOrderStatus). Hitting this with the admin
   * secret returns what Printavo actually answered, so the shape is settled
   * in one look instead of one deploy per attempt.
   *
   * Admin-only and never cached: it carries raw order data.
   */
  if (secret && adminSecretMatches(secret)) {
    const probe = await fetchRecentInvoicesForPress({ first: 5 });
    const activity = summarisePressActivity(probe.orders);

    return NextResponse.json(
      {
        ok: !probe.error,
        error: probe.error ?? null,
        orderCount: probe.orders.length,
        // What the aggregation made of it, so a shape that parses but counts
        // nothing is as visible as one that errors.
        line: activity ? describePressActivity(activity) : null,
        activity,
        raw: probe.raw ?? null,
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ line: cached.line });
  }

  const { orders, error } = await fetchRecentInvoicesForPress();

  if (error) {
    // Logged, not served. The shop finds out from the log; the visitor sees
    // a hero that simply has no press line, exactly as on a quiet week.
    console.warn(`PRESS ACTIVITY unavailable: ${error}`);
  }

  const activity = summarisePressActivity(orders);
  const line = activity ? describePressActivity(activity) : null;

  cached = { line, at: Date.now() };

  return NextResponse.json({ line });
}
