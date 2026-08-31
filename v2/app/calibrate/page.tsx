"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apparelCatalogStyles } from "../../lib/apparel-catalog";
import { composeGarmentMockup } from "../../lib/garment-composite";
import { sameOriginGarmentPhotoUrl } from "../../lib/garment-photo";
import { garmentZones } from "../../lib/garment-zones";
import {
  clampZone,
  formatStyleSnippet,
  moveZone,
  resizeZone,
  type CalibrationZone,
} from "../../lib/zone-calibration";
import type { SsCatalogProduct, SsCatalogResponse } from "../../features/types";

/**
 * /calibrate — measure where the print area sits in each S&S photograph.
 *
 * Staff-only tooling, not a customer surface: nothing links here, and the
 * page is locked behind the same server-checked PIN as the kiosk's staff
 * mode. What it exists for is the contract at the top of lib/garment-zones.ts
 * — a zone may only ship `verified: true` after a human has looked at the
 * real photo and the real composite. This page is where that looking happens:
 * the photo loads in YOUR browser (the same way it loads for every customer),
 * you drag the box over the chest, the composite re-renders through the very
 * compositor production uses, and the copy button hands you the lines to
 * paste into garmentZones.
 *
 * Nothing measured here changes the app by itself. The numbers still land in
 * a commit, where the diff is readable and reviewable — the page is a tape
 * measure, not a control panel.
 */

type Side = "front" | "back";

/**
 * Test artworks drawn at runtime, one wide and one tall, so the clamp rule
 * (art taller than maxHeight scales down, keeping aspect) is exercised in
 * front of the person judging the zone — a chest box that looks right with
 * wide art can still be wrong for tall art.
 */
function drawTestArt(aspect: number): string | null {
  if (typeof document === "undefined") return null;

  const w = 600;
  const h = Math.round(w / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#FF00FF";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(h / 5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TEST ART", w / 2, h / 2);

  return canvas.toDataURL("image/png");
}

const startingZone = (style: string, side: Side): CalibrationZone => {
  const known = garmentZones[style]?.[side];

  return known
    ? {
        centerX: known.centerX,
        top: known.top,
        width: known.width,
        maxHeight: known.maxHeight,
      }
    : { centerX: 0.5, top: 0.28, width: 0.34, maxHeight: 0.32 };
};

export default function CalibratePage() {
  // ── The lock ────────────────────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

  // ── The catalog ─────────────────────────────────────────────────────────
  const [products, setProducts] = useState<SsCatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState("");

  // ── What is being measured ──────────────────────────────────────────────
  const [styleId, setStyleId] = useState<string>(apparelCatalogStyles[0]);
  const [side, setSide] = useState<Side>("front");
  const [colorIndex, setColorIndex] = useState(0);
  const [zone, setZone] = useState<CalibrationZone>(() =>
    startingZone(apparelCatalogStyles[0], "front")
  );
  const [artAspect, setArtAspect] = useState<"wide" | "tall">("wide");
  const [saved, setSaved] = useState<
    Record<string, Partial<Record<Side, CalibrationZone>>>
  >({});

  const photoBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    lastX: number;
    lastY: number;
  } | null>(null);

  useEffect(() => {
    if (!unlocked) return;

    let cancelled = false;

    (async () => {
      try {
        const styleQuery = encodeURIComponent(apparelCatalogStyles.join(","));
        const response = await fetch(`/api/ss-catalog?style=${styleQuery}`);
        const data = (await response.json()) as SsCatalogResponse;

        if (!response.ok || data.error) {
          throw new Error(data.error || "S&S catalog did not load.");
        }

        if (!cancelled) setProducts(data.products);
      } catch (error) {
        if (!cancelled) {
          setCatalogError(
            error instanceof Error ? error.message : "Catalog failed to load."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const product = products.find((p) => p.catalogStyle === styleId) || null;
  const colors = useMemo(
    () =>
      (product?.colors ?? []).filter((color) =>
        side === "front" ? color.frontImage : color.backImage
      ),
    [product, side]
  );
  const color = colors[Math.min(colorIndex, Math.max(colors.length - 1, 0))] || null;
  const rawPhotoUrl = color
    ? side === "front"
      ? color.frontImage
      : color.backImage
    : null;
  // Same-origin, or the compositor's canvas taints — see lib/garment-photo.
  const photoUrl = sameOriginGarmentPhotoUrl(rawPhotoUrl);

  const testArt = useMemo(
    () => drawTestArt(artAspect === "wide" ? 3 : 3 / 4),
    [artAspect]
  );

  /**
   * The composite, through the production compositor, keyed to its inputs —
   * the same stale-proofing ApparelPreview uses, for the same lint reason.
   */
  const zoneKey = `${zone.centerX}|${zone.top}|${zone.width}|${zone.maxHeight}`;
  const mockupKey =
    photoUrl && testArt ? `${photoUrl}|${testArt.length}|${zoneKey}` : null;
  const [mockup, setMockup] = useState<{ key: string; url: string } | null>(null);
  const mockupUrl = mockup && mockup.key === mockupKey ? mockup.url : null;

  useEffect(() => {
    if (!photoUrl || !testArt || !mockupKey) return;

    let cancelled = false;

    composeGarmentMockup({
      garmentUrl: photoUrl,
      artworkUrl: testArt,
      zone: { verified: true, ...zone },
    }).then((url) => {
      if (!cancelled && url) setMockup({ key: mockupKey, url });
    });

    return () => {
      cancelled = true;
    };
  }, [photoUrl, testArt, mockupKey, zone]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setGateBusy(true);
    setGateError("");

    try {
      const response = await fetch("/api/kiosk-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setGateError(result?.message || "That PIN didn't work.");
        setPin("");
        return;
      }

      setUnlocked(true);
    } catch {
      setGateError("Couldn't reach the server. Try again.");
    } finally {
      setGateBusy(false);
    }
  }

  function pickStyle(nextStyle: string) {
    setStyleId(nextStyle);
    setColorIndex(0);
    setZone(saved[nextStyle]?.[side] ?? startingZone(nextStyle, side));
  }

  function pickSide(nextSide: Side) {
    setSide(nextSide);
    setColorIndex(0);
    setZone(saved[styleId]?.[nextSide] ?? startingZone(styleId, nextSide));
  }

  function startDrag(event: React.PointerEvent, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = { mode, lastX: event.clientX, lastY: event.clientY };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    const box = photoBoxRef.current?.getBoundingClientRect();
    if (!drag || !box || !box.width || !box.height) return;

    const dx = (event.clientX - drag.lastX) / box.width;
    const dy = (event.clientY - drag.lastY) / box.height;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    setZone((current) =>
      drag.mode === "move" ? moveZone(current, dx, dy) : resizeZone(current, dx, dy)
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function setField(field: keyof CalibrationZone, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setZone((current) => clampZone({ ...current, [field]: value }));
  }

  const snippet = Object.entries(saved)
    .map(([style, sides]) => formatStyleSnippet(style, sides))
    .join("\n");

  if (!unlocked) {
    return (
      <main className="mx-auto max-w-md p-6 pt-24">
        <form onSubmit={unlock} className="border border-[var(--rule)] bg-white p-6">
          <p className="eyebrow">Staff</p>
          <h1 className="mt-2 text-lede font-bold text-[var(--ink-black)]">
            Garment zone calibration
          </h1>
          <p className="mt-1 text-fine text-[var(--ink-muted)]">
            Measures where the print area sits in each product photo. Staff
            PIN required — same one as the kiosk.
          </p>

          <label htmlFor="calibrate-pin" className="mt-5 block text-fine font-semibold text-[var(--ink-black)]">
            Staff PIN
          </label>
          <input
            id="calibrate-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-value tracking-[0.3em] text-[var(--ink-black)]"
          />

          {gateError && (
            <p role="alert" className="mt-3 bg-[var(--surface-warn)] p-3 text-fine font-bold text-[var(--ink-warn)]">
              {gateError}
            </p>
          )}

          <button
            type="submit"
            disabled={gateBusy}
            className="mt-5 min-h-[56px] w-full cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 text-body font-bold text-[var(--paper)] hover:bg-[var(--gorilla-green-dark)] disabled:opacity-60"
          >
            {gateBusy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <p className="eyebrow">Staff · Calibration</p>
      <h1 className="mt-2 text-section font-bold tracking-display text-[var(--ink-black)]">
        Where does the print area sit?
      </h1>
      <p className="mt-2 max-w-2xl text-fine text-[var(--ink-muted)]">
        Drag the box over the chest (or back). The mockup beside it re-renders
        through the same compositor customers get. When both look right, save
        the side — the block below is what goes into{" "}
        <span className="spec">lib/garment-zones.ts</span>.
      </p>

      {catalogError && (
        <p role="alert" className="mt-4 bg-[var(--surface-warn)] p-3 text-fine font-bold text-[var(--ink-warn)]">
          {catalogError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="block text-fine font-semibold text-[var(--ink-black)]">
          Style
          <select
            value={styleId}
            onChange={(event) => pickStyle(event.target.value)}
            className="mt-1 block border border-[var(--rule)] bg-white p-2 text-fine"
          >
            {apparelCatalogStyles.map((style) => (
              <option key={style} value={style}>
                {products.find((p) => p.catalogStyle === style)?.displayName || style}{" "}
                ({style})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-fine font-semibold text-[var(--ink-black)]">
          Side
          <select
            value={side}
            onChange={(event) => pickSide(event.target.value as Side)}
            className="mt-1 block border border-[var(--rule)] bg-white p-2 text-fine"
          >
            <option value="front">Front</option>
            <option value="back">Back</option>
          </select>
        </label>

        <label className="block text-fine font-semibold text-[var(--ink-black)]">
          Colour (contrast helps)
          <select
            value={colorIndex}
            onChange={(event) => setColorIndex(Number(event.target.value))}
            className="mt-1 block max-w-56 border border-[var(--rule)] bg-white p-2 text-fine"
          >
            {colors.map((c, index) => (
              <option key={c.colorName} value={index}>
                {c.colorName}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-fine font-semibold text-[var(--ink-black)]">
          Test art
          <select
            value={artAspect}
            onChange={(event) => setArtAspect(event.target.value as "wide" | "tall")}
            className="mt-1 block border border-[var(--rule)] bg-white p-2 text-fine"
          >
            <option value="wide">Wide (3:1)</option>
            <option value="tall">Tall (3:4)</option>
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <figure className="border border-[var(--rule)] bg-white p-3">
          {photoUrl ? (
            <div
              ref={photoBoxRef}
              className="relative select-none"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* The measurement surface. The zone's fractions are of THIS
                  rendered box, which shares the photo's aspect because the img
                  fills it — the same mapping the compositor uses. */}
              <img
                src={photoUrl}
                alt={`${color?.colorName ?? ""} ${product?.displayName ?? ""} ${side}`}
                draggable={false}
                className="block w-full"
              />
              <div
                role="presentation"
                onPointerDown={(event) => startDrag(event, "move")}
                className="absolute cursor-move border-2 border-[#FF00FF] bg-[#FF00FF]/10"
                style={{
                  left: `${(zone.centerX - zone.width / 2) * 100}%`,
                  top: `${zone.top * 100}%`,
                  width: `${zone.width * 100}%`,
                  height: `${zone.maxHeight * 100}%`,
                }}
              >
                <span
                  role="presentation"
                  onPointerDown={(event) => startDrag(event, "resize")}
                  className="absolute -bottom-2 -right-2 size-5 cursor-nwse-resize border-2 border-white bg-[#FF00FF]"
                />
              </div>
            </div>
          ) : (
            <div className="grid h-80 place-items-center text-fine font-bold text-[var(--ink-muted)]">
              {products.length ? "No photo for this side." : "Loading catalog…"}
            </div>
          )}
          <figcaption className="mt-3 border-t border-[var(--rule)] pt-2 text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
            Drag the box · corner handle resizes
          </figcaption>
        </figure>

        <figure className="border border-[var(--rule)] bg-white p-3">
          {mockupUrl ? (
            <img src={mockupUrl} alt="Test artwork composited on the garment" className="block w-full" />
          ) : (
            <div className="grid h-80 place-items-center text-fine font-bold text-[var(--ink-muted)]">
              Composite renders here.
            </div>
          )}
          <figcaption className="mt-3 border-t border-[var(--rule)] pt-2 text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
            What the customer&rsquo;s preview would show
          </figcaption>
        </figure>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        {(
          [
            ["centerX", zone.centerX],
            ["top", zone.top],
            ["width", zone.width],
            ["maxHeight", zone.maxHeight],
          ] as [keyof CalibrationZone, number][]
        ).map(([field, value]) => (
          <label key={field} className="block text-fine font-semibold text-[var(--ink-black)]">
            <span className="spec">{field}</span>
            <input
              type="number"
              step={0.005}
              min={0}
              max={1}
              value={Number(value.toFixed(3))}
              onChange={(event) => setField(field, event.target.value)}
              className="spec mt-1 block w-28 border border-[var(--rule)] bg-white p-2 text-fine"
            />
          </label>
        ))}

        <button
          type="button"
          onClick={() =>
            setSaved((current) => ({
              ...current,
              [styleId]: { ...current[styleId], [side]: zone },
            }))
          }
          className="min-h-[44px] cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-5 text-fine font-bold text-white hover:bg-[var(--gorilla-green-dark)]"
        >
          Save {side} of {styleId}
        </button>
      </div>

      {snippet && (
        <div className="mt-6 border border-[var(--rule)] bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow">For lib/garment-zones.ts</p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(snippet)}
              className="cursor-pointer border border-[var(--rule)] px-4 py-2 text-fine font-bold hover:border-[var(--ink-black)]"
            >
              Copy
            </button>
          </div>
          <pre className="spec mt-3 overflow-x-auto bg-[var(--paper)] p-3 text-spec leading-6 text-[var(--ink-black)]">
            {snippet}
          </pre>
        </div>
      )}
    </main>
  );
}
