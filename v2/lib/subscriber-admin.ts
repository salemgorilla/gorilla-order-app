import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "./admin-auth";
import { parseCsv, toCsv } from "./subscriber-csv";
import { isSubscriberStoreConfigured } from "./subscriber-store";
import {
  mailable,
  readAllSubscribers,
  recordSubscription,
  type SubscriberStore,
} from "./subscribers";
import { isUnsubscribeConfigured } from "./unsubscribe-token";

/**
 * THE LIST, IN THE SHOP'S OWN HANDS.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * #147 moved the newsletter list off Zapier and Constant Contact and into
 * the shop's own blob store. That made the list private and permanent and
 * also made it INVISIBLE: nothing in the app could say how many people were
 * on it, who they were, or whether the store was working at all.
 *
 * An invisible list is one nobody trusts, and a list nobody trusts does not
 * get used — which is how it ends up back at a company that charges monthly
 * for the privilege of showing it to you.
 *
 * So: a count, an export, and a way in for a list that already exists.
 *
 * ── ADMIN-GUARDED, AND FAILS CLOSED ──────────────────────────────────────
 * This is the one endpoint in the app that returns customers' email
 * addresses in bulk. It answers nothing without ADMIN_SECRET, and it answers
 * nothing at all on a deployment that has no ADMIN_SECRET to check against —
 * the same rule /api/health and /api/payment-request hold, for a much
 * smaller prize than this one.
 *
 * ── THE IMPORT INVENTS NO CONSENT ────────────────────────────────────────
 * A row with no opt-in date is imported with an EMPTY one and the source
 * says where it came from. The temptation is to stamp today's date so the
 * record looks complete; that would be the app writing a consent record for
 * an agreement it did not witness, which is the one thing a consent record
 * must never contain.
 *
 * And an import cannot resurrect anybody: recordSubscription refuses an
 * address that has unsubscribed, so re-importing an old file — the classic
 * way a shop re-mails everyone who ever left — does nothing to them.
 */

function guard(request: Request): NextResponse | null {
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ADMIN_SECRET is not set, so the subscriber list is unreachable. Set it to use this endpoint.",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-admin-secret") || url.searchParams.get("secret");

  if (!adminSecretMatches(provided)) {
    // Same wording as /api/health deliberately: a "#" truncates the value in
    // a URL and an "&" splits it, and both arrive looking exactly like a
    // wrong password.
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized.",
        hint: "Append ?secret=... or send an x-admin-secret header. If the secret contains '#', '&' or '+', use the header — a URL will mangle it.",
      },
      { status: 401 }
    );
  }

  if (!isSubscriberStoreConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No blob store on this deployment, so there is no list yet. Connect one in Vercel > Storage and redeploy.",
      },
      { status: 503 }
    );
  }

  return null;
}

/**
 * GET — the count, or the whole list as a file.
 *
 * `?format=csv` downloads it. Everything else answers with the numbers plus
 * a short sample, because the usual reason to open this is "did the store
 * actually start working", and that question is answered by a number.
 */
/**
 * Split from GET so the whole answer — the counts, the ordering, the CSV
 * headers — can be driven against a Map. Without this the only testable part
 * of this file is the refusals, and the arithmetic somebody will read off a
 * phone to decide whether the store is working would be the untested half.
 */
export async function readList(
  request: Request,
  store: SubscriberStore
): Promise<NextResponse> {
  const refusal = guard(request);
  if (refusal) return refusal;

  const url = new URL(request.url);

  try {
    const records = await readAllSubscribers(store);
    const canSend = isUnsubscribeConfigured();

    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(toCsv(records), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="gorilla-newsletter-${
            new Date().toISOString().slice(0, 10)
          }.csv"`,
          // Never cached anywhere. This is a customer list.
          "Cache-Control": "no-store, private",
        },
      });
    }

    const active = mailable(records);

    return NextResponse.json({
      ok: true,
      total: records.length,
      subscribed: active.length,
      unsubscribed: records.length - active.length,
      // The state that decides whether a campaign may go out at all. A list
      // with no working opt-out is a list that must not be mailed.
      canSend,
      ...(canSend
        ? {}
        : {
            warning:
              "NEWSLETTER_SECRET is not set, so no unsubscribe link would work. Do not send until it is.",
          }),
      // The most recent handful, so "is it working" has a visible answer
      // without pulling the whole list into a browser tab.
      recent: [...active]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 10)
        .map((record) => ({
          email: record.email,
          name: record.name,
          optedInAt: record.optedInAt,
          source: record.source,
          preChecked: record.preChecked,
        })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not read the list.",
      },
      { status: 502 }
    );
  }
}

/**
 * POST — bring in a list that already exists.
 *
 * Body is the CSV itself, as text. Same columns the export writes, found by
 * NAME rather than position, so a file that has been opened and sorted still
 * imports.
 */
/** Split from the route for the same reason readList is. */
export async function importList(
  request: Request,
  store: SubscriberStore
): Promise<NextResponse> {
  const refusal = guard(request);
  if (refusal) return refusal;

  const text = await request.text();
  const { rows, skipped, error } = parseCsv(text);

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  const at = new Date().toISOString();

  let added = 0;
  let suppressed = 0;
  let failed = 0;

  for (const row of rows) {
    const outcome = await recordSubscription(
      {
        email: row.email,
        name: row.name,
        company: row.company,
        at,
        // NOT today's date when the file did not say. See the header: a
        // consent record must not contain an agreement nobody witnessed.
        // Empty is stored as empty, and the source says where it came from.
        optedInAt: row.optedInAt || "",
        source: row.source || `imported ${at.slice(0, 10)}`,
        // An imported row is not evidence the box was pre-ticked, and
        // claiming otherwise would weaken every record it touches.
        preChecked: false,
        quoteNumber: "",
      },
      store
    );

    if (!outcome.stored) failed += 1;
    else if (outcome.suppressed) suppressed += 1;
    else added += 1;
  }

  console.log(
    `SUBSCRIBER IMPORT: ${added} added, ${suppressed} left off (previously unsubscribed), ${failed} failed, ${skipped} rows skipped`
  );

  return NextResponse.json({
    ok: true,
    added,
    // Not a failure. These are people who unsubscribed, and an import that
    // put them back would be the shop mailing everyone who ever left.
    leftOffBecauseTheyUnsubscribed: suppressed,
    failed,
    rowsSkipped: skipped,
  });
}
