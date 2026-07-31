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

  // Diagnostic: which PRINTAVO* variables actually reached the runtime, and
  // whether they hold anything. NAMES AND LENGTHS ONLY — never values. This
  // catches a typo'd or empty variable, which a plain boolean can't explain.
  const seenPrintavoVars = Object.keys(process.env)
    .filter((k) => k.toUpperCase().includes("PRINTAVO"))
    .sort()
    .map((k) => ({
      name: JSON.stringify(k), // quoted so stray whitespace is visible
      length: (process.env[k] || "").length,
    }));

  const result = await testPrintavoConnection();

  return NextResponse.json(
    {
      connected: result.ok,
      configured,
      seenPrintavoVars,
      account: result.account ?? null,
      error: result.error ?? null,
      hint: result.ok
        ? customerId
          ? "Credentials work. Quote pushing is enabled."
          : "Credentials work, but PRINTAVO_CUSTOMER_ID is missing so quote pushing stays off."
        : "Add PRINTAVO_EMAIL and PRINTAVO_TOKEN to v2/.env.local, then restart the dev server.",
    },
    { status: result.ok ? 200 : 400 }
  );
}
