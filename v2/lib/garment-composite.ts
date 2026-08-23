import type { GarmentZone } from "./garment-zones";

/**
 * The customer's artwork, drawn onto the real garment photograph.
 *
 * This is only ever reached for a style whose zone someone has verified
 * against that style's own photo — see the long comment in `garment-zones.ts`.
 * Without that, compositing is the bug this whole area of the app was written
 * to stop making.
 *
 * Same contract as `sticker-proof.ts`: resolves null on ANY failure instead of
 * throwing. A mockup is a courtesy. The garment photo is served from S&S's CDN
 * and the artwork from blob storage, so a missing header or a slow host is a
 * normal outcome, and none of them can be worth blocking a quote over. Every
 * caller has to have somewhere to fall back to.
 */

export type GarmentCompositeSpec = {
  /** The style photo for the chosen colour — `GorillaCatalogColor.frontImage` / `.backImage`. */
  garmentImageUrl: string;
  /** The uploaded artwork, as the preview already has it. */
  artworkUrl: string;
  /** Verified placement for this style. Fractions of the garment photo. */
  zone: GarmentZone;
  /** Square canvas edge, in pixels. Bigger costs nothing but memory. */
  size?: number;
  /** Fills the letterbox around a contain-fitted photo. `--shirt-blank`. */
  background?: string;
};

const DEFAULT_SIZE = 900;
const SHIRT_BLANK = "#f4f1ea";

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();

    /**
     * Anonymous, so a cross-origin photo that lacks CORS headers FAILS rather
     * than silently tainting the canvas. A tainted canvas reads back fine on
     * screen and then throws on `toBlob()`/`toDataURL()` — the failure would
     * surface later, somewhere else, in the email path. Failing here means it
     * lands as a null and the caller falls back.
     */
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Largest rect of `img`'s aspect that fits inside the canvas — CSS object-contain. */
function containFit(
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
) {
  const scale = Math.min(canvasW / img.width, canvasH / img.height);
  const width = img.width * scale;
  const height = img.height * scale;

  return {
    x: (canvasW - width) / 2,
    y: (canvasH - height) / 2,
    width,
    height,
  };
}

/**
 * Composite the mockup, or return null.
 *
 * Returns the canvas rather than a data URL or a Blob so one call can serve
 * both the on-screen preview (`toDataURL`) and, if the quote email ever wants
 * this the way it wants the sticker proof, `toBlob`.
 */
export async function composeGarmentMockup(
  spec: GarmentCompositeSpec
): Promise<HTMLCanvasElement | null> {
  if (typeof document === "undefined") return null;

  try {
    const [garment, art] = await Promise.all([
      loadImage(spec.garmentImageUrl),
      loadImage(spec.artworkUrl),
    ]);

    // No photo means there is nothing to place art ON, and no art means there
    // is nothing to place. Either way this is not a mockup.
    if (!garment || !art || !art.width || !art.height) return null;

    const size = spec.size ?? DEFAULT_SIZE;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = spec.background ?? SHIRT_BLANK;
    ctx.fillRect(0, 0, size, size);

    // The photo is contain-fitted, exactly as the `<img>` beside it is, and
    // the zone's fractions are then read against THAT rect rather than against
    // the canvas. This is the step the old component skipped: its coordinates
    // were canvas-relative, so any photo that did not happen to fill the box
    // edge to edge put the art somewhere the garment was not.
    const fitted = containFit(garment, size, size);
    ctx.drawImage(garment, fitted.x, fitted.y, fitted.width, fitted.height);

    // Art is sized by the zone's WIDTH; its height follows from its own aspect
    // ratio. Never fitted to a box — a stretched logo is a worse lie than no
    // mockup, and it is the kind that gets approved because it looks placed.
    let drawW = fitted.width * spec.zone.width;
    let drawH = (art.height / art.width) * drawW;

    // A tall design would run off the hem at full zone width, so it comes down
    // proportionally until it fits the zone's height. Both dimensions scale;
    // the aspect ratio does not move.
    const maxH = fitted.height * spec.zone.maxHeight;
    if (drawH > maxH && drawH > 0) {
      const shrink = maxH / drawH;
      drawW *= shrink;
      drawH = maxH;
    }

    // Centred in the zone's width, so shrunk art stays on the centre line of
    // the garment rather than hugging the zone's left edge.
    const zoneX = fitted.x + fitted.width * spec.zone.x;
    const zoneW = fitted.width * spec.zone.width;
    const x = zoneX + (zoneW - drawW) / 2;
    const y = fitted.y + fitted.height * spec.zone.y;

    ctx.drawImage(art, x, y, drawW, drawH);

    return canvas;
  } catch (error) {
    // Same posture as the sticker proof: say so in the console, show the
    // fallback, let the quote go out.
    console.warn("Garment mockup failed; showing garment and artwork separately.", error);
    return null;
  }
}
