import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

import {
  handoffPrefix,
  isExpired,
  isValidHandoffToken,
  type HandoffFile,
} from "../../../lib/handoff";

/**
 * Has the customer's phone sent anything yet?
 *
 * The kiosk polls this while showing the QR code. It answers about ONE
 * hand-off — the one whose token the caller already holds — and returns
 * nothing else about anything else.
 *
 * The token is validated against a strict shape before it is ever put in a
 * blob path. It arrives from a URL, and a token containing "../" would be a
 * path traversal into someone else's prefix.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!isValidHandoffToken(token)) {
    return NextResponse.json({ ok: false, reason: "bad-token" }, { status: 400 });
  }

  // Reported as its own state, not as "nothing uploaded yet". The kiosk needs
  // to tell the customer the feature is off rather than leaving them staring
  // at a QR code that will never resolve.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { ok: false, reason: "not-configured" },
      { status: 501 }
    );
  }

  try {
    const result = await list({ prefix: handoffPrefix(token), limit: 10 });

    const files: HandoffFile[] = result.blobs
      // An expired upload is treated as absent. A token left on screen
      // overnight must not still be collecting files in the morning.
      .filter((blob) => !isExpired(blob.uploadedAt))
      .map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        filename: blob.pathname.split("/").pop() || "artwork",
        size: blob.size,
        uploadedAt: new Date(blob.uploadedAt).toISOString(),
      }))
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

    return NextResponse.json({ ok: true, files });
  } catch (error) {
    console.error("HANDOFF LIST FAILED");
    console.error(error);

    // Never "nothing arrived" — the customer may have just uploaded, and
    // telling them it did not arrive would send them round the loop again.
    return NextResponse.json(
      { ok: false, reason: "unavailable" },
      { status: 503 }
    );
  }
}
