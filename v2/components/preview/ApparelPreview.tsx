"use client";

import { useEffect, useState } from "react";

import { composeGarmentMockup } from "../../lib/garment-composite";
import {
  getVerifiedGarmentZone,
  pickGarmentPlacement,
} from "../../lib/garment-zones";

type Props = {
  artworkPreview: string | null;
  garmentType: string;
  garmentColor: string;
  garmentImage?: string | null;
  /**
   * The BACK photograph for the selected colour (`GorillaCatalogColor.backImage`).
   *
   * Separate from `garmentImage`, which is always the front. A back composite
   * has to be drawn on the back photo — back coordinates on a front photo is
   * the same class of mistake as coordinates nobody measured, and it would
   * look just as placed. No back photo, no back composite.
   */
  garmentBackImage?: string | null;
  /**
   * The real colour from the S&S catalog (`color1`), when the catalog has
   * loaded. Preferred over the local map below, which only covers the seven
   * fallback names and cannot know a style's actual blank.
   */
  garmentColorHex?: string | null;
  /**
   * S&S styleID for the selected product (`GorillaCatalogProduct.catalogStyle`).
   *
   * Optional, and absent means exactly one thing: no composite. It is the key
   * into `garment-zones.ts`, and without a style there is no way to know where
   * this particular photograph's print area is.
   */
  catalogStyle?: string | null;
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
 * The composited mockup, when — and only when — one can be drawn honestly.
 *
 * Returns null far more often than not, and every one of those is a normal
 * outcome rather than an error: no style selected, a style whose zone nobody
 * has verified yet (which is currently ALL of them), no garment photo, no
 * artwork, a CDN that would not serve the photo cross-origin, a browser that
 * gave us no 2D context. The caller shows the side-by-side view for all of it.
 */
function useGarmentMockup({
  catalogStyle,
  garmentImage,
  garmentBackImage,
  artworkPreview,
  printLocations,
}: {
  catalogStyle?: string | null;
  garmentImage?: string | null;
  garmentBackImage?: string | null;
  artworkPreview: string | null;
  printLocations: string[];
}) {
  const placement = pickGarmentPlacement(printLocations);

  // Referentially stable: zones are module constants, so this object is the
  // same one every render for a given style and placement, and the effect
  // below does not re-run on unrelated state changes.
  const zone = placement ? getVerifiedGarmentZone(catalogStyle, placement) : null;

  // The photo that actually shows the side being printed.
  const photo = (placement === "Back" ? garmentBackImage : garmentImage) || null;

  /**
   * Keyed by the inputs it was drawn from, so a result that arrives after the
   * customer has changed something is ignored instead of shown. Without the
   * key, swapping artwork leaves the PREVIOUS design sitting on the garment
   * until the new composite resolves — a mockup of a file they just replaced.
   */
  const key = zone && photo && artworkPreview
    ? `${catalogStyle}|${placement}|${photo}|${artworkPreview}`
    : null;

  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(
    null
  );

  useEffect(() => {
    if (!key || !zone || !photo || !artworkPreview) return;

    let cancelled = false;

    composeGarmentMockup({
      garmentImageUrl: photo,
      artworkUrl: artworkPreview,
      zone,
    })
      .then((canvas) => {
        if (cancelled || !canvas) return;

        try {
          setRendered({ key, url: canvas.toDataURL("image/png") });
        } catch {
          // toDataURL throws on a tainted canvas. It should not be reachable —
          // the compositor loads anonymously — but a throw here has to land as
          // the fallback view, not as a broken preview.
        }
      })
      .catch(() => {
        // composeGarmentMockup resolves null rather than rejecting. Belt and
        // braces: a mockup is never worth breaking the quote screen over.
      });

    return () => {
      cancelled = true;
    };
  }, [key, zone, photo, artworkPreview]);

  return {
    placement,
    mockup: rendered && rendered.key === key ? rendered.url : null,
  };
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
 * cannot back up.
 *
 * A composite IS now drawn — but only for a style whose print area someone has
 * measured against that style's own photograph and marked verified in
 * `garment-zones.ts`. That is the piece of work the paragraph above called for:
 * the placement comes from the photo rather than from constants nobody checked.
 * For every other style the fallback below is what renders, unchanged, and no
 * flag has to be remembered — an unverified zone simply produces no composite.
 */
export default function ApparelPreview({
  artworkPreview,
  garmentType,
  garmentColor,
  garmentImage,
  garmentBackImage,
  garmentColorHex,
  catalogStyle,
  printLocations,
  inkColors,
  quantity,
}: Props) {
  const swatch = getSwatchColor(garmentColor, garmentColorHex);

  const { placement, mockup } = useGarmentMockup({
    catalogStyle,
    garmentImage,
    garmentBackImage,
    artworkPreview,
    printLocations,
  });

  return (
    <div className="border border-[var(--rule)] bg-white p-5 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Apparel Proof</p>
          <h3 className="mt-2 text-head font-bold tracking-display">
            Live Preview
          </h3>
        </div>

        <div className="shrink-0 bg-[var(--gorilla-green)] px-4 py-2 text-sm font-bold text-white">
          {garmentType}
        </div>
      </div>

      <div className="mt-8 bg-[var(--shirt-blank)] p-5">
        <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">
                {mockup ? `Mockup — ${placement}` : "Garment & Artwork"}
              </p>

              {/* Says exactly what this is. The previous caption implied a
                  placed proof while showing artwork at coordinates that did
                  not correspond to the photograph. The composite gets its own
                  wording: the placement is real but approximate, and saying
                  "proof" of either view would be claiming too much. */}
              <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                {mockup
                  ? "Preview only — placement and size are approximate. Gorilla Salem reviews the real proof before printing."
                  : "Preview only — shown side by side, not to final size or position. Gorilla Salem reviews the real proof before printing."}
              </p>
            </div>

            <p className="spec shrink-0 border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-spec text-[var(--ink-muted)]">
              {quantity} pcs
            </p>
          </div>

          {mockup ? (
            <figure className="mt-4 border border-[var(--rule)] bg-[var(--paper)] p-3">
              <img
                src={mockup}
                alt={`Your artwork on the ${placement?.toLowerCase()} of a ${garmentColor} ${garmentType}`}
                className="mx-auto h-64 w-full object-contain"
              />

              <figcaption className="mt-3 border-t border-[var(--rule)] pt-2 text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Your artwork on the garment — {placement}
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
              <p className="mt-1 text-sm font-bold text-[var(--ink-black)]">
                {garmentType}
              </p>
            </div>

            <div className="bg-white p-3">
              <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Colour
              </p>
              <p className="mt-1 flex items-center justify-center gap-2 text-sm font-bold text-[var(--ink-black)]">
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
              <p className="mt-1 text-sm font-bold text-[var(--ink-black)]">
                {inkColors}
              </p>
            </div>
          </div>

          {/* The locations are the thing the composite would have shown. Said
              as text, they are accurate; drawn on an unmeasured photo, they
              were not — and the composite above only ever shows ONE of them,
              so this stays put even when a mockup is on screen. */}
          <div className="mt-3 bg-white p-3 text-center">
            <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Print Locations
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-black)]">
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
