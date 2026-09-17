import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

import { dropoffPrefix, type DropoffFile } from "../../../../lib/dropoff";
import { readDropoffToken } from "../../../../lib/dropoff-token";
import { escapeEmailHtml, sendShopEmail } from "../../../../lib/email";

/**
 * "I'm done" — the one moment the shop is told anything.
 *
 * ── WHY AN EMAIL, AND NOT A PRINTAVO ATTACHMENT ───────────────────────────
 * The obvious thing would be to push these files onto the Printavo order.
 * Whether that API accepts a file upload is unverified — it is an open
 * question in PRINTAVO-PROBE.md — and this is a customer standing at a
 * counter being told their artwork arrived. Building the confirmation on an
 * unproven call would mean the screen says "sent" and the shop finds out
 * whether that was true later.
 *
 * So the files sit in blob storage under the session's prefix, and the shop
 * gets one email naming the order and linking each file. That is the same
 * route every other artwork in this app reaches the shop by, and the shop
 * already works from that inbox. If the Printavo file API is proven later,
 * this is where it goes, in addition to the email and not instead of it.
 *
 * ── WHY IT RE-LISTS RATHER THAN TRUSTING THE BODY ─────────────────────────
 * The counter screen knows what it uploaded. It is still the browser, and a
 * browser is not the authority on what is in the shop's store — a posted
 * list of filenames and URLs is a posted list of anything the poster likes,
 * arriving in the shop's inbox as links worth clicking. The server reads the
 * prefix the token names and reports what is actually there.
 */
export async function POST(request: Request) {
  let token: unknown = "";

  try {
    const body = await request.json();
    token = body?.token;
  } catch {
    // A malformed body is a bad token, not a server error.
  }

  const claim = readDropoffToken(token);

  if (!claim) {
    return NextResponse.json({ ok: false, reason: "bad-token" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 501 });
  }

  let files: DropoffFile[] = [];

  try {
    const result = await list({ prefix: dropoffPrefix(token as string), limit: 50 });

    files = result.blobs
      .map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        filename: blob.pathname.split("/").pop() || "artwork",
        size: blob.size,
        uploadedAt: new Date(blob.uploadedAt).toISOString(),
      }))
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  } catch (error) {
    console.error("DROPOFF LIST FAILED on done");
    console.error(error);

    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }

  // Nothing arrived, so there is nothing to tell anyone. Not an error: a
  // customer who walked up, looked it up and changed their mind is a normal
  // thing to happen at a counter, and an email saying "0 files" every time
  // is an email the shop stops reading.
  if (files.length === 0) {
    return NextResponse.json({ ok: true, files: 0, notified: false });
  }

  const lines = files.map(
    (file) => `${file.filename} (${Math.round(file.size / 1024)} KB)\n${file.url}`
  );

  const notification = await sendShopEmail({
    // The order number first: this lands in the same inbox as the quotes, and
    // the shop's next move is to find that job.
    subject: `ARTWORK DROPPED OFF — ${claim.quoteNumber} — ${files.length} file${
      files.length === 1 ? "" : "s"
    }`,
    text: [
      `A customer used the drop-off screen in the shop.`,
      ``,
      `Order: ${claim.quoteNumber}`,
      `Files: ${files.length}`,
      ``,
      ...lines,
      ``,
      `These are in blob storage, not attached to the Printavo order — put`,
      `them on the job the way you normally would.`,
    ].join("\n"),
    html: [
      `<p>A customer used the drop-off screen in the shop.</p>`,
      `<p><strong>Order:</strong> ${escapeEmailHtml(claim.quoteNumber)}<br>`,
      `<strong>Files:</strong> ${files.length}</p>`,
      `<ul>`,
      ...files.map(
        (file) =>
          `<li><a href="${escapeEmailHtml(file.url)}">${escapeEmailHtml(
            file.filename
          )}</a> (${Math.round(file.size / 1024)} KB)</li>`
      ),
      `</ul>`,
      `<p>These are in blob storage, not attached to the Printavo order — put them on the job the way you normally would.</p>`,
    ].join(""),
  });

  console.log(
    `DROPOFF_COMPLETED order=${claim.quoteNumber} files=${files.length} notified=${notification.sent}`
  );

  return NextResponse.json({
    ok: true,
    files: files.length,
    notified: notification.sent,
  });
}
