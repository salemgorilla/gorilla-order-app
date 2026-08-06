import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic. Measures the largest multipart body this deployment
 * will actually accept, with no side effects — it sends no email, creates no
 * Printavo quote, and stores nothing.
 *
 * The real quote route reads `request.formData()` the same way, so whatever
 * this route rejects, the quote route rejects too. Delete once the artwork
 * upload path is settled.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("probe");

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, reason: "no file field" });
    }

    return NextResponse.json({
      ok: true,
      bytes: file.size,
      mb: Number((file.size / (1024 * 1024)).toFixed(2)),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
