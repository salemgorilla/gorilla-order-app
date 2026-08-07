"use client";

import { useEffect, useRef } from "react";

import { composeDieCut } from "../../lib/die-cut-canvas";

type Props = {
  artworkUrl: string;
  /** Vinyl border width, in canvas pixels. */
  borderPx: number;
  /** Opaque stock colour for the chosen material. */
  bodyColor: string;
  magentaCutLine: boolean;
  /** How large the art sits within the sticker, 20-150. */
  scale: number;
  sizePx: number;
};

/**
 * The die-cut preview.
 *
 * REPLACES AN SVG FILTER. The contour maths is identical, but an SVG filter
 * cannot fill an interior hole — dilation only grows outward from the
 * artwork's silhouette, so a ring previewed with a see-through middle. That
 * was wrong about the product: the cutter follows the OUTER contour only, so
 * the middle of a donut is vinyl, and every material the shop runs is opaque.
 *
 * Filling it is a connectivity problem, not a convolution, which is why this
 * moved to canvas. composeDieCut is shared with the emailed proof, so the
 * customer approves exactly what the shop is sent.
 */
export default function DieCutCanvas({
  artworkUrl,
  borderPx,
  bodyColor,
  magentaCutLine,
  scale,
  sizePx,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      if (cancelled) return;

      const canvas = ref.current;
      if (!canvas) return;

      // Padding so the contour has room to grow; without it the edge is
      // clipped by the canvas it is drawn on.
      const pad = Math.ceil(borderPx * 3 + 12);
      const box = sizePx * (scale / 100);
      const fit = Math.min(box / image.width, box / image.height);
      const drawW = image.width * fit;
      const drawH = image.height * fit;

      const art = document.createElement("canvas");
      art.width = sizePx + pad * 2;
      art.height = sizePx + pad * 2;
      const actx = art.getContext("2d");
      if (!actx) return;

      actx.drawImage(
        image,
        pad + (sizePx - drawW) / 2,
        pad + (sizePx - drawH) / 2,
        drawW,
        drawH
      );

      const composed = composeDieCut({
        art,
        borderPx,
        bodyColor,
        magentaCutLine,
      });

      canvas.width = art.width;
      canvas.height = art.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(composed ?? art, 0, 0);
    };

    // A preview we cannot draw is not worth breaking the page over.
    image.onerror = () => {};
    image.src = artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [artworkUrl, borderPx, bodyColor, magentaCutLine, scale, sizePx]);

  return (
    <canvas
      ref={ref}
      aria-label="Die-cut contour preview"
      className="max-h-full max-w-full object-contain drop-shadow-[0_10px_12px_rgba(0,0,0,0.30)]"
    />
  );
}
