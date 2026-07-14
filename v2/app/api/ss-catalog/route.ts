import { NextResponse } from "next/server";

import { fetchSsActivewearCatalog } from "../../../lib/ss-activewear";
import {
  apparelCatalogItems,
  apparelCatalogStyles,
} from "../../../lib/apparel-catalog";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const styleParam =
      searchParams.get("style") ||
      process.env.SS_DEFAULT_STYLES ||
      apparelCatalogStyles.join(",");

    const styles = styleParam
      .split(",")
      .map((style) => style.trim())
      .filter(Boolean);

    const catalog = await fetchSsActivewearCatalog(styles);

    // Merge Gorilla's customer-facing labels/categories onto the raw S&S
    // products, matching on the style code each product was fetched under.
    const products = catalog.products.map((product) => {
      const catalogItem = apparelCatalogItems.find(
        (item) => item.style === product.catalogStyle
      );

      return {
        ...product,
        customerLabel: catalogItem?.label ?? product.displayName,
        customerCategory: catalogItem?.category ?? "Other",
        catalogStyle: product.catalogStyle,
        catalogNotes: catalogItem?.notes ?? "",
      };
    });

    return NextResponse.json(
      { ...catalog, products },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
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
