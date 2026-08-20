import {
  getBorderPx,
  getStickerBodyColor,
  MAGENTA,
  STICKER_EDGE,
} from "./die-cut";
import { composeDieCut } from "./die-cut-canvas";
import {
  getArtDrawSize,
  getSafeAreaFactor,
  getStickerCard,
} from "./sticker-geometry";

export type ProofSpec = {
  artworkUrl: string;
  shape: string;
  material: string;
  finish: string;
  sizeLabel: string;
  quantity: number;
  widthInches: number;
  heightInches: number;
  artScale: number;
  /** Customer opted to let art run past the cut edge. */
  artBleed?: boolean;
  artMargin: number;
  magentaCutLine: boolean;
  /**
   * Whether the artwork has a see-through background. null when unknown.
   *
   * A die cut is derived from the alpha channel, so opaque art produces a
   * rectangular cut. The proof draws that faithfully — and has to SAY so, or
   * it looks like the renderer failed rather than like the file needs work.
   */
  hasTransparentEdges?: boolean | null;
  quoteNumber?: string;
};

const CANVAS_W = 1000;
const CANVAS_H = 1180;
const STAGE = 720; // the square the sticker is fitted into
const STAGE_TOP = 150;

const PAPER = "#f4f1ea";
const INK = "#111111";
const MUTED = "#8a8578";
const RULE = "#d8d2c4";

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    // A proof we cannot draw is not worth failing the order over — the quote
    // still goes out, just without the picture.
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Render the proof the customer sees on screen, as a PNG for the quote email.
 *
 * Returns null rather than throwing on any failure. The proof is a courtesy;
 * losing it must never cost the order.
 */
export async function renderStickerProof(
  spec: ProofSpec
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  try {
    const art = await loadImage(spec.artworkUrl);
    if (!art) return null;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // ---- header ------------------------------------------------------
    ctx.fillStyle = INK;
    ctx.font = "bold 34px 'Space Grotesk', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("GORILLA LABS", 70, 78);

    ctx.fillStyle = MUTED;
    ctx.font = "17px 'JetBrains Mono', monospace";
    ctx.fillText("STICKER PROOF", 70, 106);

    if (spec.quoteNumber) {
      ctx.textAlign = "right";
      ctx.fillText(spec.quoteNumber, CANVAS_W - 70, 106);
    }

    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, 124);
    ctx.lineTo(CANVAS_W - 70, 124);
    ctx.stroke();

    // ---- sticker at its true aspect ratio ----------------------------
    // Same rule as the on-screen card, at a bigger magnification. Shared so
    // the proof cannot render a different rectangle from the one approved.
    const { cardW, cardH } = getStickerCard(
      spec.widthInches > 0 ? spec.widthInches : 1,
      spec.heightInches > 0 ? spec.heightInches : 1,
      STAGE
    );

    const cardX = (CANVAS_W - cardW) / 2;
    const cardY = STAGE_TOP + (STAGE - cardH) / 2;

    const isDieCut = spec.shape === "Die Cut";
    /**
     * Scaled against the LONGEST side, which is what getStickerGeometry is
     * fed (`longestInches`) when it renders the inch figure beside the
     * slider. The border drawn here and the border quoted there have to be
     * the same measurement.
     */
    const borderPx = getBorderPx(spec.artMargin, Math.max(cardW, cardH));

    if (isDieCut) {
      // Art on a transparent layer, padded so the contour has room to grow.
      const pad = Math.ceil(borderPx * 3 + 12);
      const layer = document.createElement("canvas");
      layer.width = Math.ceil(cardW) + pad * 2;
      layer.height = Math.ceil(cardH) + pad * 2;
      const lctx = layer.getContext("2d");
      if (!lctx) return null;

      const { drawW, drawH } = getArtDrawSize({
        cardW,
        cardH,
        artWidth: art.width,
        artHeight: art.height,
        scalePercent: spec.artScale,
      });

      lctx.drawImage(
        art,
        pad + (cardW - drawW) / 2,
        pad + (cardH - drawH) / 2,
        drawW,
        drawH
      );

      // One shared compositor with the on-screen preview, so the proof cannot
      // show a different cut from the one the customer approved.
      const composed = composeDieCut({
        art: layer,
        borderPx,
        bodyColor: getStickerBodyColor(spec.material),
        magentaCutLine: spec.magentaCutLine,
      });

      ctx.drawImage(composed ?? layer, cardX - pad, cardY - pad);
    } else {
      // Shaped stickers: the card IS the vinyl, so its outline is the cut.
      // White stock with a grey rule on the boundary — filling the whole card
      // grey was tried and read as a grey sticker rather than white vinyl,
      // and it disagreed with the white card the on-screen preview shows.
      ctx.save();
      ctx.fillStyle = getStickerBodyColor(spec.material);

      if (spec.shape === "Circle" || spec.shape === "Oval") {
        ctx.beginPath();
        ctx.ellipse(
          cardX + cardW / 2,
          cardY + cardH / 2,
          cardW / 2,
          cardH / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.closePath();
      } else if (spec.shape === "Rounded Corners") {
        roundedRect(ctx, cardX, cardY, cardW, cardH, Math.min(cardW, cardH) * 0.14);
      } else {
        ctx.beginPath();
        ctx.rect(cardX, cardY, cardW, cardH);
        ctx.closePath();
      }

      ctx.fill();

      // The cut, drawn on the boundary. Magenta replaces the grey when the
      // customer marked a cut line, rather than stacking on top of it.
      ctx.strokeStyle = spec.magentaCutLine ? MAGENTA : STICKER_EDGE;
      ctx.lineWidth = spec.magentaCutLine ? 5 : 7;
      ctx.stroke();

      ctx.clip();

      // A square inscribed in a circle is only ~70.7% of its diameter, so
      // round shapes need the art held further in or it rides the cut edge.
      const { drawW, drawH } = getArtDrawSize({
        cardW,
        cardH,
        artWidth: art.width,
        artHeight: art.height,
        scalePercent: spec.artScale,
        safeAreaFactor: getSafeAreaFactor(spec.shape),
      });

      ctx.drawImage(
        art,
        cardX + (cardW - drawW) / 2,
        cardY + (cardH - drawH) / 2,
        drawW,
        drawH
      );
      ctx.restore();
    }

    // ---- spec block --------------------------------------------------
    const rows: [string, string][] = [
      ["SIZE", `${spec.widthInches}" x ${spec.heightInches}"`],
      ["SHAPE", spec.shape],
      // The proof still CLIPS at the cut, because that is what the finished
      // sticker looks like. But a shop reading a clipped picture cannot tell
      // that art was meant to run past the blade — so the spec says it in
      // words rather than leaving the picture to imply it did not.
      ...(spec.artBleed
        ? ([["BLEED", "Art runs past the cut edge (customer's choice)"]] as [
            string,
            string
          ][])
        : []),
      ["MATERIAL", `${spec.material} / ${spec.finish}`],
      ["QUANTITY", String(spec.quantity)],
    ];

    let y = STAGE_TOP + STAGE + 70;

    ctx.strokeStyle = RULE;
    ctx.beginPath();
    ctx.moveTo(70, y - 34);
    ctx.lineTo(CANVAS_W - 70, y - 34);
    ctx.stroke();

    rows.forEach(([label, value]) => {
      ctx.textAlign = "left";
      ctx.fillStyle = MUTED;
      ctx.font = "16px 'JetBrains Mono', monospace";
      ctx.fillText(label, 70, y);

      ctx.fillStyle = INK;
      ctx.font = "bold 20px 'Space Grotesk', Arial, sans-serif";
      ctx.fillText(value, 260, y);

      y += 38;
    });

    // "Band" is only true of a die cut; a shaped sticker gets a rule on its
    // boundary. Saying the wrong one invites the customer to look for
    // something that is not there.
    const legend = spec.magentaCutLine
      ? "MAGENTA = YOUR CUT LINE. GREY = VINYL EDGE. NEITHER IS PRINTED."
      : isDieCut
      ? "GREY BAND = THE CUT EDGE. NOT PRINTED."
      : "GREY LINE = THE CUT EDGE. NOT PRINTED.";

    ctx.fillStyle = MUTED;
    ctx.font = "15px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(legend, 70, CANVAS_H - 46);

    // A die cut off opaque art is a rectangle, and the proof shows a rectangle.
    // Unlabelled, that reads as a broken render rather than as a file that
    // needs its background knocked out — so name it, in the shop's red, on the
    // artifact prepress actually opens.
    if (isDieCut && spec.hasTransparentEdges === false) {
      ctx.fillStyle = "#b23a2e";
      ctx.font = "bold 15px 'JetBrains Mono', monospace";
      ctx.fillText(
        "SOLID BACKGROUND - CUT FOLLOWS THE IMAGE EDGE. KNOCK OUT BEFORE CUTTING.",
        70,
        CANVAS_H - 20
      );
    }

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png")
    );
  } catch (error) {
    console.warn("Proof render failed; sending quote without it.", error);
    return null;
  }
}
