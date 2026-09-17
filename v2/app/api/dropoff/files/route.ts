import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

import { dropoffPrefix, type DropoffFile } from "../../../../lib/dropoff";
import { readDropoffToken } from "../../../../lib/dropoff-token";

/**
 * What has arrived in this session so far.
 *
 * The counter screen polls this while the customer uploads — from the USB
 * port in front of them, or from their phone after scanning the QR code. It
 * is what makes a phone upload appear on the counter screen without anybody
 * touching the counter screen.
 *
 * It answers about ONE session, named by a token whose signature is checked
 * before anything is read. An expired or forged token gets the same answer as
 * a shape-invalid one.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const claim = readDropoffToken(token);

  if (!claim) {
    return NextResponse.json({ ok: false, reason: "bad-token" }, { status: 400 });
  }

  // Its own state, not "nothing uploaded yet" — the screen has to tell the
  // customer the feature is off rather than leave them watching a QR code
  // that will never resolve.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 501 });
  }

  try {
    const result = await list({ prefix: dropoffPrefix(token as string), limit: 50 });

    const files: DropoffFile[] = result.blobs
      .map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        filename: blob.pathname.split("/").pop() || "artwork",
        size: blob.size,
        uploadedAt: new Date(blob.uploadedAt).toISOString(),
      }))
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

    return NextResponse.json({ ok: true, quoteNumber: claim.quoteNumber, files });
  } catch (error) {
    console.error("DROPOFF LIST FAILED");
    console.error(error);

    // Never "nothing arrived" — the customer may have just uploaded, and
    // saying it did not arrive sends them round the loop again.
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
