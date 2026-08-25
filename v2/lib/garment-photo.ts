/**
 * Serve a garment photograph from OUR origin instead of S&S's.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * Two consumers need the photo, and one of them has a hard requirement:
 *
 *   1. composeGarmentMockup draws it to a canvas and exports a data URL. A
 *      cross-origin image whose host does not send CORS headers TAINTS the
 *      canvas — toDataURL throws, the composite resolves null, and the
 *      mockup silently never appears no matter how carefully the zone was
 *      calibrated. S&S does not promise CORS headers; our own /_next/image
 *      passthrough (allowed for exactly these hosts in next.config.ts) is
 *      same-origin, which can never taint.
 *
 *   2. The plain <img> views get the optimizer for free — resized, cached,
 *      modern format — the exact thing the no-img-element warnings ask for.
 *
 * ── WHY THE HOST CHECK ────────────────────────────────────────────────────
 * next.config.ts allows exactly two hosts through the optimizer, on purpose
 * (an open pattern would make the app a public image proxy). A URL on any
 * other host would come back 400 from /_next/image — a broken photo where a
 * cross-origin one at least displayed. Unknown hosts pass through untouched:
 * the <img> still works, and the compositor's null-not-throw contract turns
 * the taint into the honest side-by-side fallback.
 */

const OPTIMIZED_HOSTS = new Set(["www.ssactivewear.com", "cdn.ssactivewear.com"]);

/** Matches next.config's deviceSizes; the photos are ~1200px originals. */
const WIDTH = 1080;

export function sameOriginGarmentPhotoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return raw;
  }

  if (!OPTIMIZED_HOSTS.has(host)) return raw;

  return `/_next/image?url=${encodeURIComponent(raw)}&w=${WIDTH}&q=75`;
}
