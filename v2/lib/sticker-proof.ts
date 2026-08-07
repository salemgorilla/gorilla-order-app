import { getStickerBodyColor, MAGENTA, STICKER_EDGE } from "./die-cut";
import { composeDieCut } from "./die-cut-canvas";

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
  artMargin: number;
  magentaCutLine: boolean;
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

/**
 * The border, in canvas pixels.
 *
 * The preview computes this as a fraction of a 256px card. The proof stage is
 * larger, so the same artMargin has to scale with it or the emailed proof
 * would show a visibly thinner edge than the one the customer approved.
 */
function borderPxForStage(artMargin: number, stagePx: number) {
  const PREVIEW_CARD_PX = 256;
  const previewBorder = (Math.min(Math.max(artMargin, 0), 100) / 100) * 16;
  return previewBorder * (stagePx / PREVIEW_CARD_PX);
}

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
    const w = spec.widthInches > 0 ? spec.widthInches : 1;
    const h = spec.heightInches > 0 ? spec.heightInches : 1;
    const aspect = w / h;

    let cardW = STAGE;
    let cardH = STAGE;
    if (aspect >= 1) cardH = STAGE / aspect;
    else cardW = STAGE * aspect;

    const cardX = (CANVAS_W - cardW) / 2;
    const cardY = STAGE_TOP + (STAGE - cardH) / 2;

    const isDieCut = spec.shape === "Die Cut";
    const borderPx = borderPxForStage(spec.artMargin, Math.max(cardW, cardH));
    const scale = Math.min(Math.max(spec.artScale, 20), 150) / 100;

    if (isDieCut) {
      // Art on a transparent layer, padded so the contour has room to grow.
      const pad = Math.ceil(borderPx * 3 + 12);
      const layer = document.createElement("canvas");
      layer.width = Math.ceil(cardW) + pad * 2;
      layer.height = Math.ceil(cardH) + pad * 2;
      const lctx = layer.getContext("2d");
      if (!lctx) return null;

      const boxW = cardW * scale;
      const boxH = cardH * scale;
      const fit = Math.min(boxW / art.width, boxH / art.height);
      const drawW = art.width * fit;
      const drawH = art.height * fit;

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
      const safe =
        spec.shape === "Circle" || spec.shape === "Oval"
          ? 0.707
          : spec.shape === "Rounded Corners"
          ? 0.88
          : 0.96;

      const boxW = cardW * safe * scale;
      const boxH = cardH * safe * scale;
      const fit = Math.min(boxW / art.width, boxH / art.height);
      const drawW = art.width * fit;
      const drawH = art.height * fit;

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

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png")
    );
  } catch (error) {
    console.warn("Proof render failed; sending quote without it.", error);
    return null;
  }
}
