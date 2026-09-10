import { NextResponse } from "next/server";

import { vercelSubscriberStore, isSubscriberStoreConfigured } from "../../../lib/subscriber-store";
import { unsubscribeEmail } from "../../../lib/subscribers";
import { verifyUnsubscribeToken } from "../../../lib/unsubscribe-token";

/**
 * TAKING SOMEBODY OFF THE LIST — THE ONE ENDPOINT THAT MUST NEVER BE DOWN.
 *
 * ── POST ONLY, AND THAT IS NOT AN OVERSIGHT ──────────────────────────────
 * Mail clients, corporate link scanners and preview generators all fetch
 * URLs found in a message with no human involved. An unsubscribe that acts
 * on GET is an unsubscribe that happens to people who never clicked, and
 * they find out when the emails stop — or worse, never find out.
 *
 * So the link in an email points at /unsubscribe, a page that asks once and
 * posts here. And the List-Unsubscribe header — the one-click path Gmail and
 * Yahoo have required from bulk senders since February 2024 — is a POST by
 * specification (RFC 8058) for precisely the same reason. Both arrive here.
 *
 * ── IT ANSWERS 200 FAR MORE OFTEN THAN IT SUCCEEDS ───────────────────────
 * A customer pressing unsubscribe must never see an error. Not when they
 * press it twice, not when they were never on the list, not when the blob
 * store is unreachable. What they need to see is "you're off", and the
 * shop's job is to make that true — which is why a storage failure is
 * logged loudly here and still answered calmly.
 *
 * The single exception is a bad token: that is not a customer, it is
 * somebody constructing URLs, and the honest answer to them is no.
 */

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  // Two shapes reach this. The page posts JSON; RFC 8058 one-click posts a
  // form body of `List-Unsubscribe=One-Click`, with the address and token
  // in the URL the header carried.
  const url = new URL(request.url);
  let email = url.searchParams.get("e") || "";
  let token = url.searchParams.get("t") || "";

  if (!email && contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);

    if (body && typeof body === "object") {
      email = String((body as Record<string, unknown>).email || "");
      token = String((body as Record<string, unknown>).token || "");
    }
  }

  if (!verifyUnsubscribeToken(email, token)) {
    // Deliberately vague, and deliberately not 404: a different answer for
    // "wrong token" and "unknown address" would turn this into a way to
    // test whether an address is on the list.
    return NextResponse.json(
      { ok: false, message: "That unsubscribe link is not valid." },
      { status: 400 }
    );
  }

  if (!isSubscriberStoreConfigured()) {
    // Nothing to remove them FROM yet, so nothing has gone wrong for them.
    // The shop needs to know; the customer does not.
    console.error(
      "UNSUBSCRIBE COULD NOT BE RECORDED — no BLOB_READ_WRITE_TOKEN on this deployment."
    );

    return NextResponse.json({ ok: true, recorded: false });
  }

  const result = await unsubscribeEmail(
    email,
    new Date().toISOString(),
    vercelSubscriberStore()
  );

  if (!result.ok) {
    // The loudest line in this file. An unsubscribe the shop failed to
    // record is a promise it is about to break, and the only way anyone
    // finds out is this log.
    console.error(`UNSUBSCRIBE FAILED TO STORE: ${result.reason}`);

    return NextResponse.json({ ok: true, recorded: false });
  }

  console.log(
    `UNSUBSCRIBED (${result.alreadyOff ? "already off the list" : "removed"})`
  );

  return NextResponse.json({ ok: true, recorded: true });
}
