import { NextResponse } from "next/server";

import { getPrintavoConfig, testPrintavoConnection } from "../../../lib/printavo";

// GET /api/printavo-test
// Confirms your Printavo credentials work, without creating anything.
export async function GET() {
  const { email, token, customerId } = getPrintavoConfig();

  const configured = {
    PRINTAVO_EMAIL: Boolean(email),
    PRINTAVO_TOKEN: Boolean(token),
    PRINTAVO_CUSTOMER_ID: Boolean(customerId),
  };

  const result = await testPrintavoConnection();

  return NextResponse.json(
    {
      connected: result.ok,
      configured,
      account: result.account ?? null,
      error: result.error ?? null,
      // Pushing needs only email + token (see isConfigured in lib/printavo.ts).
      // PRINTAVO_CUSTOMER_ID stopped being required once find-or-create landed;
      // it is now just the fallback for a customer whose email can't be
      // resolved. This hint used to claim pushing was "off" without it, which
      // was alarming and wrong.
      hint: result.ok
        ? customerId
          ? "Credentials work. Quote pushing is on, with a fallback customer set."
          : "Credentials work. Quote pushing is on. PRINTAVO_CUSTOMER_ID is optional — set it to catch the rare quote whose customer email can't be resolved."
        : "Add PRINTAVO_EMAIL and PRINTAVO_TOKEN, then redeploy (env vars only apply to new deployments).",
    },
    { status: result.ok ? 200 : 400 }
  );
}
