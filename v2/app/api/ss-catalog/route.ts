import { after, NextResponse } from "next/server";

import {
  applyLearnedColorOrder,
  rankingIsStale,
  type LearnedRanking,
} from "../../../lib/adaptive-color-order";
import {
  isUsageTrackingEnabled,
  readLearnedRanking,
  rebuildLearnedRanking,
  vercelUsageStore,
} from "../../../lib/order-usage-store";
import { fetchSsActivewearCatalog } from "../../../lib/ss-activewear";
import { apparelPricingConfig } from "../../../lib/apparel-pricing-config";
import {
  apparelCatalogItems,
  apparelCatalogStyles,
} from "../../../lib/apparel-catalog";

/**
 * The learned colour order (lib/adaptive-color-order.ts), or null.
 *
 * Bounded: a slow or broken blob store costs the catalogue at most this
 * long, and then the hand-written order shows as it always has. When the
 * stored order is a day old, a rebuild is queued to run AFTER this response
 * is sent, so no customer waits on it; the next load picks it up.
 */
const RANKING_READ_TIMEOUT_MS = 1500;

let rebuildQueuedAt = 0;

async function learnedRanking(): Promise<LearnedRanking | null> {
  if (!isUsageTrackingEnabled()) return null;
  const store = vercelUsageStore();

  const ranking = await Promise.race([
    readLearnedRanking(store).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RANKING_READ_TIMEOUT_MS)),
  ]);

  // One queued rebuild per instance per hour at most, whatever the traffic.
  if (rankingIsStale(ranking) && Date.now() - rebuildQueuedAt > 3_600_000) {
    rebuildQueuedAt = Date.now();
    try {
      after(async () => {
        try {
          await rebuildLearnedRanking(store);
        } catch (error) {
          console.error(
            "COLOR ORDER NOT REBUILT:",
            error instanceof Error ? error.message : String(error)
          );
        }
      });
    } catch {
      // Outside a request scope (a test): skip the rebuild.
    }
  }

  return ranking;
}

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

    const [catalog, ranking] = await Promise.all([
      fetchSsActivewearCatalog(styles),
      learnedRanking(),
    ]);

    // Merge Gorilla's customer-facing labels/categories onto the raw S&S
    // products, matching on the style code each product was fetched under.
    const products = catalog.products.map((product) => {
      const catalogItem = apparelCatalogItems.find(
        (item) => item.style === product.catalogStyle
      );

      return {
        ...product,
        // Most-picked and most-ordered here first, pins on top, once the
        // garment has enough data; the hand-written order until then.
        colors: applyLearnedColorOrder(product.colors, product.catalogStyle, ranking),
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
        markupRate: apparelPricingConfig.baseGarmentMarkup,
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
