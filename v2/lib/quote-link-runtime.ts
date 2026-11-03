import { fetchSsActivewearCatalog } from "./ss-activewear";
import { sendShopEmail, escapeEmailHtml } from "./email";
import { createPaidQuoteLinkOrder, findExistingQuote } from "./printavo";
import { liveQuoteLinkStore } from "./quote-link-blob";
import type { Deps } from "./quote-link-service";
import type { QuoteLinkSize } from "./quote-link";
import { SITE_ORIGIN } from "./unsubscribe-token";
import { createCheckoutSession, expireCheckoutSession, isStripeConfigured } from "./stripe";

/**
 * The live wiring for lib/quote-link-service.ts. Nothing here decides
 * anything; it only connects the service's seams to the real systems.
 */
export function liveDeps(): Deps {
  return {
    store: liveQuoteLinkStore(),
    origin: SITE_ORIGIN,
    stripe: {
      configured: isStripeConfigured(),
      createSession: createCheckoutSession,
      expireSession: expireCheckoutSession,
    },
    printavo: {
      find: findExistingQuote,
      create: createPaidQuoteLinkOrder,
    },
    async notifyShop(subject, lines) {
      // Failure to email must never fail the customer's action - the event is
      // already in the log. It is logged loudly instead.
      const result = await sendShopEmail({
        subject: `[Quote link] ${subject}`,
        text: lines.join("\n"),
        html: lines.map((l) => `<p>${escapeEmailHtml(l)}</p>`).join(""),
        to: process.env.QUOTE_LINK_NOTIFY_EMAIL?.trim() || undefined,
      }).catch((error) => ({ sent: false, error: String(error) }));

      if (!result.sent) {
        console.error(`QUOTE LINK EMAIL NOT SENT (${subject}):`, result);
      }
    },
  };
}

/** Sizes for one style and colour, customer prices only. */
export async function catalogSizesFor(
  style: string,
  colorName: string
): Promise<
  | { ok: true; sizes: QuoteLinkSize[]; brand: string; imageUrl?: string }
  | { ok: false; error: string }
> {
  try {
    const catalog = await fetchSsActivewearCatalog([style]);
    const product = catalog.products.find((p) => p.catalogStyle === style) ?? catalog.products[0];
    const color = product?.colors.find(
      (c) => c.colorName.toLowerCase() === colorName.trim().toLowerCase()
    );

    if (!product || !color) {
      const names = product?.colors.slice(0, 8).map((c) => c.colorName).join(", ");
      return { ok: false, error: `No colour "${colorName}" for style ${style}. Try: ${names}` };
    }

    return {
      ok: true,
      brand: product.brandName,
      imageUrl: color.frontImage ?? undefined,
      // Wholesale is deliberately not copied.
      sizes: color.sizes.map((s) => ({
        sizeName: s.sizeName,
        markedUpPrice: s.markedUpPrice,
        priceByMarkup: s.priceByMarkup,
        available: s.isAvailable && !s.outOfStock,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "S&S catalog error." };
  }
}
