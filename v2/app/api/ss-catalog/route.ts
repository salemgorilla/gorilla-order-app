import { NextResponse } from "next/server";

import { fetchSsActivewearCatalog } from "../../../lib/ss-activewear";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const styleParam =
      searchParams.get("style") ||
      process.env.SS_DEFAULT_STYLES ||
      "3001CVC,5000";

    const styles = styleParam
      .split(",")
      .map((style) => style.trim())
      .filter(Boolean);

    const catalog = await fetchSsActivewearCatalog(styles);

    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("S&S CATALOG API ERROR");
    console.error(error);

    return NextResponse.json(
      {
        source: "ss-activewear",
        generatedAt: new Date().toISOString(),
        markupRate: Number(process.env.SS_MARKUP_RATE || 0.4),
        products: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to load S&S catalog.",
      },
      { status: 500 }
    );
  }
}
