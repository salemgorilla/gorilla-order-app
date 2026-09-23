import { issueSignedToken } from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { describeBuild } from "../../../lib/build-stamp";
import {
  checkBlobStore,
  describeBlobHealth,
  readBlobCredential,
} from "../../../lib/blob-health";
import {
  isAllowedUploadPath,
  MAX_BLOB_ARTWORK_BYTES,
} from "../../../lib/upload-limits";

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
  /**
   * CONFIGURED MEANS "AN UPLOAD WILL SUCCEED", AND NOTHING WEAKER.
   *
   * This used to report Boolean(BLOB_READ_WRITE_TOKEN). On 2026-09-01 that
   * said yes while production logged, on a real customer's submission,
   * "Vercel Blob: This store does not exist" — the token was there, the
   * store it named was not, and every direct upload was failing.
   *
   * The browser READS this answer: the upload box advertises 100 MB when it
   * says configured and 3.5 MB when it does not, and anything over 3.5 MB
   * is dropped from the quote. So a wrong yes here is the app promising a
   * ceiling it cannot honour, to the customer, at the moment they choose a
   * file. It now probes the store — see lib/blob-health.ts, including why
   * the probe is cached.
   */
  const health = await checkBlobStore();

  // Report WHICH credential is missing, not just that something is.
  //
  // A connected blob store can provision either of two credential sets, and
  // they are not interchangeable here: OIDC (BLOB_STORE_ID plus a token Vercel
  // injects at runtime) works for server-side blob calls, but handleUpload —
  // the client-upload path, which is the only one that bypasses the ~4.4 MB
  // function body limit — resolves credentials through
  // getReadWriteBlobTokenFromOptionsOrEnv and accepts BLOB_READ_WRITE_TOKEN
  // alone.
  //
  // Without this breakdown the endpoint just said "not configured" next to a
  // perfectly good store, and the store looked correctly connected in the
  // dashboard. Naming the missing variable turns that into a five-second fix.
  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasStoreId = Boolean(process.env.BLOB_STORE_ID);

  // NAMES ONLY, never values. A typo in the variable name is invisible from
  // the dashboard — the row looks right at a glance — and it is the last
  // candidate once a fresh build still reports the token missing.
  const blobVarNames = Object.keys(process.env)
    .filter((key) => key.startsWith("BLOB"))
    .sort();

  const stamp = describeBuild();

  return NextResponse.json({
    // CAN THE BROWSER ACTUALLY UPLOAD? Not "is the store alive".
    //
    // These came apart on 2026-09-23 and the endpoint briefly promised
    // 100 MB while every client upload was failing. Server-side calls
    // resolve OIDC first, so the store probe passed; handleUpload has no
    // OIDC branch and was still using a read-write token that does not
    // parse. Healthy store, broken uploads, and `hasReadWriteToken &&
    // reachable` answered true to both.
    //
    // The browser reads this to choose between advertising 100 MB and
    // 3.5 MB, and anything over 3.5 MB is dropped from the quote, so a
    // wrong yes here costs a customer their artwork. See clientUploadsReady.
    configured: health.reachable && health.clientUploadsReady,
    // Kept separate so a reader can tell "no token" from "token, dead
    // store" without reading the prose — they have different fixes.
    reachable: health.reachable,
    // Which build is answering. Real emitted code, not a comment — a comment
    // is stripped by the minifier, so a fresh deployment produced byte
    // identical chunks and was indistinguishable from no deployment at all.
    // That cost hours of chasing a broken-deploys theory that was never true.
    //
    // DERIVED, not typed. This was a hand-written date string that then went
    // two weeks without being updated, so it reported a 7 August build on a
    // deployment minutes old — and a stale stamp is worse than none, because
    // it gets believed. See lib/build-stamp.ts.
    build: stamp.label,
    buildDetail: stamp,
    detail: {
      BLOB_READ_WRITE_TOKEN: hasReadWriteToken,
      BLOB_STORE_ID: hasStoreId,
      blobVarNames,
      // WHICH credential the SDK resolves — "oidc" or "read-write". The
      // single most useful field here, because the two fail differently and
      // the dashboard shows the same healthy store row for both. A project
      // on OIDC does not need BLOB_READ_WRITE_TOKEN at all, and chasing
      // that variable while OIDC is in use is days of wasted work.
      credential: health.credential,
      // Split out because they are now genuinely different answers: the
      // store can be reachable while client uploads are not ready.
      clientUploadsReady: health.clientUploadsReady,
      // WHICH STORE each side names — the one comparison that separates
      // "the store is gone" from "this token is from another store", which
      // the SDK reports with the same sentence and the dashboard shows as a
      // healthy row either way. See lib/blob-health.ts, readTokenStoreId.
      //
      // Store IDs, NOT secrets. BLOB_STORE_ID is a plain environment
      // variable, and the token carries the same id in the clear as its
      // third underscore-separated segment; nothing after that segment is
      // read here or anywhere else.
      tokenStoreId: health.tokenStoreId,
      projectStoreId: health.projectStoreId,
      // Present ONLY when the token failed to parse, and then only as
      // counts and booleans — never a character of it. "Not a blob token"
      // is where the last round of guessing started; this says how.
      tokenShape: health.tokenShape,
      // The SDK's own sentence, unedited. "This store does not exist" names
      // the fix; a paraphrase would not.
      storeError: health.error,
      needed: describeBlobHealth(health),
    },
  });
}

export async function POST(request: Request) {
  /**
   * PRESIGNED, NOT A CLIENT TOKEN — AND WHY IT HAD TO CHANGE.
   *
   * This route used handleUpload, which mints a client token through
   * getReadWriteBlobTokenFromOptionsOrEnv. That helper has NO OIDC branch:
   * it reads BLOB_READ_WRITE_TOKEN and nothing else. Vercel no longer
   * issues a static read-write token when you connect a blob store — the
   * store's own .env.local tab hands out BLOB_STORE_ID alone — so this
   * route depended on a credential the platform had stopped providing, and
   * the only way to satisfy it was to paste one in by hand.
   *
   * That paste is what failed, repeatedly and invisibly, for three days:
   * a value cut short at the store id, which still mints a client token
   * (the store id is segment 3 and survives truncation) and then fails in
   * the CUSTOMER's browser at upload time.
   *
   * handleUploadPresigned + issueSignedToken resolve through
   * BlobCommandOptions, which prefers OIDC — the credential every other
   * blob call in this app already uses. No static secret exists to paste,
   * truncate, leak or revoke.
   *
   * IT IS ALSO A TIGHTER GRANT. The old client token authorised the
   * browser against the store. A delegation authorises ONE pathname, ONE
   * operation, under a size cap, until an expiry. The endpoint is public —
   * a customer uploading artwork has no account and no session — so the
   * scope of what it hands out is the only control there is.
   *
   * REQUIRES BLOB_WEBHOOK_PUBLIC_KEY. handleUploadPresigned throws without
   * it even when no completion callback is used. Vercel writes it when the
   * store is connected, alongside BLOB_STORE_ID.
   */
  if (readBlobCredential() === "none") {
    // 501 is what the client reads as "fall back to sending the file
    // inline". Keeps the form working on a deployment with no blob store
    // instead of breaking it.
    return NextResponse.json(
      { error: "Blob storage is not configured on this deployment." },
      { status: 501 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadPresignedBody;

    const result = await handleUploadPresigned({
      request,
      body,
      getSignedToken: async (pathname) => {
        /**
         * WHERE the browser may write, not just how much.
         *
         * The pathname arrives from the caller and was once ignored, which
         * made this a public licence to write anything, anywhere in the
         * shop's store. Rejected by throwing: the error surfaces as the 400
         * below and no delegation is ever issued.
         */
        if (!isAllowedUploadPath(pathname)) {
          console.error(`ARTWORK UPLOAD REFUSED for path: ${pathname}`);
          throw new Error("That upload path is not allowed.");
        }

        const token = await issueSignedToken({
          // Scoped to this one path. NOT a "*" wildcard — that would hand
          // a browser store-wide write and undo the guard above.
          pathname,
          operations: ["put"],
          // Enforced in the delegation itself, so it holds even if the
          // url options below were ever relaxed.
          maximumSizeInBytes: MAX_BLOB_ARTWORK_BYTES,
        });

        return {
          token,
          urlOptions: {
            // Deliberately NOT restricting content types. Print artwork
            // arrives with unreliable MIME: Windows Chrome reports "" for
            // .eps and "application/postscript" for .ai, and an allowlist
            // would reject the files this shop is sent most. Size and path
            // are the real guards.
            maximumSizeInBytes: MAX_BLOB_ARTWORK_BYTES,
            // Two customers uploading "logo.png" must not overwrite each
            // other. Carried as a signed query parameter and applied by the
            // API when it stores the object, so the delegation above still
            // names the path the caller asked for.
            addRandomSuffix: true,
          },
        };
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("ARTWORK UPLOAD PRESIGN ERROR");
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
