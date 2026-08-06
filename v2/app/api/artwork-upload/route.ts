import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { MAX_BLOB_ARTWORK_BYTES } from "../../../lib/upload-limits";

/**
 * Issues short-lived tokens so the browser can upload artwork STRAIGHT to blob
 * storage, never through a serverless function.
 *
 * This is the whole point: a function request body is capped at ~4.4 MB by the
 * platform (measured — see lib/upload-limits), which is smaller than most
 * real print files. A direct-to-blob upload does not touch a function, so the
 * cap does not apply and 100 MB artwork works.
 *
 * Returns 501 when no blob store is connected, which the client treats as
 * "fall back to sending the file inline". That keeps the form working on a
 * deployment with no BLOB_READ_WRITE_TOKEN instead of breaking it.
 */
/**
 * Lets the upload box state the real ceiling. Without this it would have to
 * guess, and guessing high is exactly the failure this whole change fixes.
 * Reports only a boolean — never the token.
 */
export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured on this deployment." },
      { status: 501 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => ({
        // Deliberately NOT restricting content types. Print artwork arrives
        // with unreliable MIME: Windows Chrome reports "" for .eps and
        // "application/postscript" for .ai, and an allowlist would reject the
        // exact files this shop is sent most. The size cap below is the real
        // abuse guard.
        maximumSizeInBytes: MAX_BLOB_ARTWORK_BYTES,
        // Two customers uploading "logo.png" must not overwrite each other.
        addRandomSuffix: true,
      }),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("ARTWORK UPLOAD TOKEN ERROR");
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
