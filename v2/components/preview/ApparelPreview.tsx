"use client";

import { useEffect, useState } from "react";

import { composeGarmentMockup } from "../../lib/garment-composite";
import { getVerifiedGarmentZone } from "../../lib/garment-zones";

type Props = {
  artworkPreview: string | null;
  garmentType: string;
  garmentColor: string;
  garmentImage?: string | null;
  /**
   * S&S styleID, when the catalog has loaded. Keys the placement-zone lookup
   * in lib/garment-zones.ts — absent, unknown, or unverified all mean the
   * side-by-side view below, automatically.
   */
  catalogStyle?: string | null;
  /**
   * The real colour from the S&S catalog (`color1`), when the catalog has
   * loaded. Preferred over the local map below, which only covers the seven
   * fallback names and cannot know a style's actual blank.
   */
  garmentColorHex?: string | null;
  printLocations: string[];
  inkColors: string;
  quantity: number;
};

/**
 * Garment blanks — the colour of physical product, NOT interface tokens.
 *
 * DESIGN-SYSTEM.md §3 is explicit that these must never be swept into the
 * palette: you design onto the blank, it is not a UI surface. Kept local, and
 * now used only to fill a swatch in the spec row so the customer can see which
 * colour they picked. A real `colorHex` from the catalog wins when present.
 */
const garmentColors: Record<string, string> = {
  Black: "#171717",
  White: "#f8f5ee",
  "Heather Gray": "#9ca3af",
  Navy: "#1e3a5f",
  "Forest Green": "#2E5037",
  Red: "#b7352d",
  "Custom / Not Sure": "#6f695e",
};

function getSwatchColor(color: string, colorHex?: string | null) {
  const trimmed = colorHex?.trim();

  if (trimmed) {
    // S&S returns bare values as often as prefixed ones.
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }

  return garmentColors[color] || "#6f695e";
}

/**
 * Order Desk — apparel proof.
 *
 * This replaces a garment drawn out of absolutely-positioned divs. That
 * component was not merely off-system, it was wrong in two ways that mattered
 * more than the styling:
 *
 *   1. The real S&S photograph was rendered last, over the whole box, so the
 *      drawing underneath was already dead weight — and at opacity-95 the fake
 *      shirt bled through, tinting every white tee with the default green.
 *   2. The artwork overlays were pinned at coordinates tuned to the drawn
 *      body. The photo is object-contain, so where the chest actually lands
 *      depends on that photo's aspect and crop. The customer was shown their
 *      art at an arbitrary spot on a real garment and told it was a proof.
 *
 * So the artwork and the garment are shown as two separate framed items, and
 * the print locations are listed as text. Nothing here claims a placement it
 * cannot back up. A composite proof is worth building, but the placement has
 * to be derived from the photograph rather than from constants — that is its
 * own piece of work, not a coat of paint on this one.
 */
export default function ApparelPreview({
  artworkPreview,
  garmentType,
  garmentColor,
  garmentImage,
  garmentColorHex,
  catalogStyle,
  printLocations,
  inkColors,
  quantity,
}: Props) {
  const swatch = getSwatchColor(garmentColor, garmentColorHex);

  /**
   * The composited mockup, for the styles where a human has verified where
   * the print area sits in the photograph — and ONLY those. Everything else
   * falls through to the side-by-side view below, which is the honest
   * default this component exists for. There is no flag to remember to
   * flip: the absence of a verified zone IS the fallback trigger.
   *
   * Front wins when both locations are picked — one composite, matching the
   * face of the shirt a customer pictures.
   */
  const placement = printLocations.includes("Front")
    ? ("Front" as const)
    : printLocations.includes("Back")
    ? ("Back" as const)
    : null;
  const zone = placement ? getVerifiedGarmentZone(catalogStyle, placement) : null;

  /**
   * The mockup is stored WITH the inputs it was composed from, and rendered
   * only when they still match. That is what makes clearing unnecessary: a
   * stale composite simply stops matching when the garment, artwork or
   * placement changes, so the effect never has to set state synchronously to
   * blank it (which is also what the lint rule about cascading renders
   * forbids).
   */
  const mockupKey =
    zone && garmentImage && artworkPreview
      ? `${garmentImage}|${artworkPreview}|${placement}`
      : null;
  const [mockup, setMockup] = useState<{ key: string; url: string } | null>(
    null
  );
  const mockupUrl = mockup && mockup.key === mockupKey ? mockup.url : null;

  useEffect(() => {
    // Nothing to compose; whatever is stored no longer matches and will not
    // render.
    if (!zone || !garmentImage || !artworkPreview || !mockupKey) return;

    let cancelled = false;

    composeGarmentMockup({
      garmentUrl: garmentImage,
      artworkUrl: artworkPreview,
      zone,
    }).then((url) => {
      // A failed composite resolves null (never throws), which lands us in
      // the side-by-side view — losing the mockup must never lose the page.
      if (!cancelled && url) setMockup({ key: mockupKey, url });
    });

    return () => {
      cancelled = true;
    };
  }, [zone, garmentImage, artworkPreview, mockupKey]);

  return (
    <div className="border border-[var(--rule)] bg-white p-5 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Apparel Proof</p>
          <h3 className="mt-2 text-head font-bold tracking-display">
            Live Preview
          </h3>
        </div>

        <div className="shrink-0 bg-[var(--gorilla-green)] px-4 py-2 text-fine font-bold text-white">
          {garmentType}
        </div>
      </div>

      <div className="mt-8 bg-[var(--shirt-blank)] p-5">
        <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Garment &amp; Artwork</p>

              {/* Says exactly what this is. The previous caption implied a
                  placed proof while showing artwork at coordinates that did
                  not correspond to the photograph. */}
              <p className="mt-1 text-fine font-bold text-[var(--ink-muted)]">
                Preview only — shown side by side, not to final size or
                position. Gorilla Salem reviews the real proof before printing.
              </p>
            </div>

            <p className="spec shrink-0 border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-spec text-[var(--ink-muted)]">
              {quantity} pcs
            </p>
          </div>

          {mockupUrl ? (
            <figure className="mt-4 border border-[var(--rule)] bg-[var(--paper)] p-3">
              <img
                src={mockupUrl}
                alt={`Your artwork placed on the ${garmentColor} ${garmentType}`}
                className="mx-auto max-h-80 w-full object-contain"
              />
              <figcaption className="mt-3 border-t border-[var(--rule)] pt-2 text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {placement} placement — approximate. Gorilla Salem confirms
                the real proof before printing.
              </figcaption>
            </figure>
          ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <figure className="border border-[var(--rule)] bg-[var(--paper)] p-3">
              {garmentImage ? (
                <img
                  src={garmentImage}
                  alt={`${garmentColor} ${garmentType}`}
                  className="mx-auto h-40 w-full object-contain"
                />
              ) : (
                // Designed, not blank. Hats and any style without catalog
                // photography land here, and the old component simply drew a
                // hat instead — which was the same fiction in a different hat.
                <div className="grid h-40 place-items-center border border-dashed border-[var(--rule)] bg-[var(--shirt-blank)] p-3 text-center">
                  <div>
                    <p className="spec text-spec uppercase text-[var(--ink-muted)]">
                      No photo
                    </p>
                    <p className="mt-2 text-fine font-bold text-[var(--ink-muted)]">
                      We&rsquo;ll send a mockup with your quote.
                    </p>
                  </div>
                </div>
              )}

              <figcaption className="mt-3 border-t border-[var(--rule)] pt-2 text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                The garment
              </figcaption>
            </figure>

            <figure className="border border-[var(--rule)] bg-[var(--paper)] p-3">
              {artworkPreview ? (
                <img
                  src={artworkPreview}
                  alt="Your uploaded artwork"
                  className="mx-auto h-40 w-full object-contain"
                />
              ) : (
                <div className="grid h-40 place-items-center border border-dashed border-[var(--rule)] bg-[var(--shirt-blank)] p-3 text-center">
                  <div>
                    <p className="spec text-spec uppercase text-[var(--ink-muted)]">
                      No artwork
                    </p>
                    <p className="mt-2 text-fine font-bold text-[var(--ink-muted)]">
                      Add it on the artwork step.
                    </p>
                  </div>
                </div>
              )}

              <figcaption className="mt-3 border-t border-[var(--rule)] pt-2 text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Your artwork
              </figcaption>
            </figure>
          </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="bg-white p-3">
              <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Garment
              </p>
              <p className="mt-1 text-fine font-bold text-[var(--ink-black)]">
                {garmentType}
              </p>
            </div>

            <div className="bg-white p-3">
              <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Colour
              </p>
              <p className="mt-1 flex items-center justify-center gap-2 text-fine font-bold text-[var(--ink-black)]">
                {/* Hairline framed, or a white blank vanishes into the cell.
                    The name carries the meaning; the swatch confirms it. */}
                <span
                  aria-hidden
                  className="inline-block size-3 shrink-0 border border-[var(--rule)]"
                  style={{ backgroundColor: swatch }}
                />
                {garmentColor}
              </p>
            </div>

            <div className="bg-white p-3">
              <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Ink
              </p>
              <p className="mt-1 text-fine font-bold text-[var(--ink-black)]">
                {inkColors}
              </p>
            </div>
          </div>

          {/* The locations are the thing the composite would have shown. Said
              as text, they are accurate; drawn on a photo, they were not. */}
          <div className="mt-3 bg-white p-3 text-center">
            <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Print Locations
            </p>
            <p className="mt-1 text-fine font-bold text-[var(--ink-black)]">
              {printLocations.length > 0
                ? printLocations.join(" • ")
                : "None selected"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
