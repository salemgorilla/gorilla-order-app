import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../lib/admin-auth";
import { readBlobCredential } from "../../../lib/blob-health";
import { describeSelftest, runBlobSelftest } from "../../../lib/blob-selftest";

/**
 * "Can a customer actually upload artwork?" — answered by uploading one.
 *
 *   /api/blob-selftest?secret=…
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Between 21 and 24 September client uploads were broken three times, for
 * three unrelated reasons, and every one was found by a person dropping a
 * file and reporting back. /api/artwork-upload said the store was fine
 * throughout — because listing a blob and uploading one are different
 * questions, and only the first was ever asked.
 *
 * This asks the second: issue a delegation, presign a PUT, send bytes
 * through it, confirm the object exists, delete it. See lib/blob-selftest.
 *
 * ── WHY IT IS ADMIN-GUARDED AND WRITES ────────────────────────────────────
 * It costs a real write on every call, so it is not on the page-load path
 * and not public — an open endpoint that writes to the shop's store is a
 * free way to run up someone else's bill. Guarded the same way /api/health
 * and /api/printavo-schema are, and fails closed when ADMIN_SECRET is
 * unset.
 *
 * It cleans up after itself, and says so when it could not: a self-test
 * that leaks objects is worse than none.
 */
export async function GET(request: Request) {
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_SECRET is not set, so this self-test is disabled." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const provided = request.headers.get("x-admin-secret") || url.searchParams.get("secret");

  if (!adminSecretMatches(provided)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const credential = readBlobCredential();

  if (credential === "none") {
    // Nothing to test WITH. Distinct from a failing upload, and a different
    // fix — say which rather than reporting a broken store.
    return NextResponse.json(
      {
        ok: false,
        credential,
        summary:
          "No blob credential of either kind is set, so there is nothing to test. " +
          "Connect a blob store in Vercel → Storage and redeploy.",
      },
      { status: 503 }
    );
  }

  const result = await runBlobSelftest();

  return NextResponse.json(
    {
      ok: result.ok,
      credential,
      summary: describeSelftest(result),
      // Per step, so a failure names WHICH of the four legs broke. "Upload
      // failed" was the sentence that cost three days; "PUT to presigned
      // url: HTTP 403" is the one that ends it in a minute.
      steps: result.steps,
      storedPathname: result.storedPathname,
      cleanedUp: result.cleanedUp,
    },
    // 200 even on failure: this is a report, and a non-2xx makes it look
    // like the endpoint broke rather than the thing it measures.
    { status: 200 }
  );
}
