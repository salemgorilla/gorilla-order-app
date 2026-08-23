import type { GarmentZone } from "./garment-zones";

/**
 * Draw the customer's artwork onto the garment photograph, inside a zone a
 * human has verified against that photograph.
 *
 * ── THE CONTRACT, SHARED WITH sticker-proof.ts ────────────────────────────
 * Resolves null on ANY failure — image that will not load, canvas that will
 * not context, zero-sized art, no DOM. A mockup is a courtesy; there is no
 * failure of it that could be worth blocking or degrading a quote over, so
 * nothing here throws.
 *
 * ── GEOMETRY ──────────────────────────────────────────────────────────────
 * The canvas takes the PHOTO's own aspect ratio (long edge capped for
 * memory), so the zone's fractional coordinates — fractions of the
 * photograph, per lib/garment-zones.ts — map straight onto the canvas with
 * no letterbox arithmetic to get wrong. The artwork is drawn at the zone's
 * width; its height follows the ART's own aspect ratio, never stretched.
 * Art that would come out taller than the zone's maxHeight scales down to
 * fit, still keeping its aspect, and re-centres on the zone's centreline.
 */

const MAX_EDGE = 1000;

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function composeGarmentMockup(input: {
  garmentUrl: string;
  artworkUrl: string;
  zone: GarmentZone;
}): Promise<string | null> {
  if (typeof document === "undefined") return null;

  try {
    const [garment, artwork] = await Promise.all([
      loadImage(input.garmentUrl),
      loadImage(input.artworkUrl),
    ]);

    if (!garment || !artwork) return null;
    if (!garment.naturalWidth || !garment.naturalHeight) return null;
    if (!artwork.naturalWidth || !artwork.naturalHeight) return null;

    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(garment.naturalWidth, garment.naturalHeight)
    );
    const canvasW = Math.round(garment.naturalWidth * scale);
    const canvasH = Math.round(garment.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(garment, 0, 0, canvasW, canvasH);

    const { zone } = input;
    let drawW = zone.width * canvasW;
    let drawH = drawW * (artwork.naturalHeight / artwork.naturalWidth);

    const maxH = zone.maxHeight * canvasH;
    if (drawH > maxH) {
      // Scale DOWN to fit, keeping the art's aspect — never squash.
      const shrink = maxH / drawH;
      drawH = maxH;
      drawW *= shrink;
    }

    ctx.drawImage(
      artwork,
      zone.centerX * canvasW - drawW / 2,
      zone.top * canvasH,
      drawW,
      drawH
    );

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
