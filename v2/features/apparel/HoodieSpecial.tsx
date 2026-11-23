"use client";

import Chip from "../../components/ui/Chip";
import OptionSelector from "../../components/OptionSelector";
import SizeBreakdownGrid from "./SizeBreakdownGrid";
import {
  HOODIE_SPECIAL,
  HOODIE_SPECIAL_INK_OPTIONS,
  formatLastDay,
  hoodieSpecialSides,
  type HoodieSpecialSides,
} from "../../lib/hoodie-special";
import { getPrintPlacement } from "../../lib/print-placements";
import type { FieldErrors } from "../../lib/validation";

/**
 * The 50 Hoodie Special, in the apparel step — lib/hoodie-special.ts has the
 * offer and its prices; this is only the form.
 *
 * Two pieces. The ENTRY is the button Gabe asked for: a card at the top of
 * the apparel section that names the deal and starts it, and once started
 * becomes the strip that says you are on it and lets you leave. The BUILDER
 * replaces the garment catalogue while the special is on, because almost
 * nothing in the catalogue applies: the garment is fixed, the price ignores
 * size, colour count and screens, and there is no second garment.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

export function HoodieSpecialEntry({
  active,
  onStart,
  onLeave,
}: {
  active: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const terms = `${money(HOODIE_SPECIAL.frontPrice)} each front print · ${money(
    HOODIE_SPECIAL.frontAndBackPrice
  )} each front and back · one price XS to 5XL · up to ${
    HOODIE_SPECIAL.maxInksPerSide
  } ink colors per side · setup included`;

  if (active) {
    return (
      <div
        data-testid="hoodie-special-active"
        className="flex flex-col gap-3 border-2 border-[var(--gorilla-green)] bg-[var(--surface-ok)] p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="eyebrow text-[var(--gorilla-green)]">
            {HOODIE_SPECIAL.name}
          </p>
          <p className="mt-1 text-fine font-medium leading-5 text-[var(--ink-black)]">
            {terms}. Order by {formatLastDay()}.
          </p>
        </div>

        <button
          type="button"
          data-testid="hoodie-special-leave"
          onClick={onLeave}
          className="min-h-[44px] shrink-0 cursor-pointer border border-[var(--rule)] bg-white px-4 text-fine font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
        >
          Switch to a regular quote
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-2 border-[var(--ink-black)] bg-[var(--paper)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="eyebrow">Limited time</p>
        <p className="mt-1 text-value font-bold text-[var(--ink-black)]">
          {HOODIE_SPECIAL.name}
        </p>
        <p className="mt-1 text-fine font-medium leading-5 text-[var(--ink-muted)]">
          {terms}. {HOODIE_SPECIAL.minPieces} hoodies or more, order by{" "}
          {formatLastDay()}.
        </p>
      </div>

      <button
        type="button"
        data-testid="hoodie-special-start"
        onClick={onStart}
        className="min-h-[44px] shrink-0 cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-5 text-fine font-bold text-white transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)] hover:bg-[var(--ink-black)] active:translate-x-[2px] active:translate-y-[2px]"
      >
        Order the hoodie special
      </button>
    </div>
  );
}

type BuilderProps = {
  garmentColor: string;
  printLocations: string[];
  inkColors: string;
  inkColorsByLocation: Record<string, string>;
  sizeQuantities: Record<string, number>;
  sizeTotal: number;
  /** Ink colours the artwork reader counted, when it has read the file. */
  artworkColorCount: number | null;
  /** The customer's tick that their art prints in 2 colors per side. */
  artConfirmed: boolean;
  onConfirmArt: (confirmed: boolean) => void;
  fieldErrors?: FieldErrors;
  onSelectColor: (colorName: string) => void;
  onSelectSides: (sides: HoodieSpecialSides) => void;
  onSelectPlacement: (side: "front" | "back", placementId: string) => void;
  onSelectInk: (location: string, inkColors: string) => void;
  onStepSize: (sizeName: string, change: number) => void;
  onSetSize: (sizeName: string, value: number) => void;
  onResetSizes: () => void;
  onLeave: () => void;
};

export function HoodieSpecialBuilder({
  garmentColor,
  printLocations,
  inkColors,
  inkColorsByLocation,
  sizeQuantities,
  sizeTotal,
  artworkColorCount,
  artConfirmed,
  onConfirmArt,
  fieldErrors,
  onSelectColor,
  onSelectSides,
  onSelectPlacement,
  onSelectInk,
  onStepSize,
  onSetSize,
  onResetSizes,
  onLeave,
}: BuilderProps) {
  const sides = hoodieSpecialSides(printLocations);
  const frontLocation =
    printLocations.find((location) =>
      HOODIE_SPECIAL.frontPlacements.includes(location)
    ) || HOODIE_SPECIAL.frontPlacements[0];
  const backLocation = printLocations.find((location) =>
    HOODIE_SPECIAL.backPlacements.includes(location)
  );
  const short = Math.max(0, HOODIE_SPECIAL.minPieces - sizeTotal);
  const artTooBusy =
    artworkColorCount !== null &&
    artworkColorCount > HOODIE_SPECIAL.maxInksPerSide;

  const placementChips = (side: "front" | "back", selected: string) => {
    const ids =
      side === "front"
        ? HOODIE_SPECIAL.frontPlacements
        : HOODIE_SPECIAL.backPlacements;

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ids.map((id) => {
          const isSelected = selected === id;
          const size = getPrintPlacement(id)?.sizes.hoodie;

          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectPlacement(side, id)}
              className={`min-h-[44px] border px-4 py-3 text-left text-fine font-bold transition ${
                isSelected
                  ? "border-[var(--gorilla-green)] bg-[var(--gorilla-green)] text-white"
                  : "border-[var(--rule)] bg-[var(--shirt-blank)] text-[var(--ink-black)] hover:bg-white"
              }`}
            >
              <span className="block">{id === "Front" ? "Full front" : id === "Back" ? "Full back" : id}</span>
              {size && (
                <span
                  className={`mt-1 block text-spec font-medium ${
                    isSelected ? "text-white" : "text-[var(--ink-muted)]"
                  }`}
                >
                  {size}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Colour first: it is the one choice that changes what the shop
          orders, and the swatches are the special's own eight. */}
      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
        <p className="eyebrow">Hoodie color</p>
        <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
          The special is printed on one hoodie only: the Clique{" "}
          {HOODIE_SPECIAL.garmentLabel} from {HOODIE_SPECIAL.supplier}. Every
          color is the same price.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HOODIE_SPECIAL.colors.map((color) => {
            const isSelected = garmentColor === color.name;

            return (
              <button
                key={color.name}
                type="button"
                aria-pressed={isSelected}
                data-testid={`hoodie-special-color-${color.name}`}
                onClick={() => onSelectColor(color.name)}
                className={`min-h-[44px] cursor-pointer border p-3 text-left transition ${
                  isSelected
                    ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                    : "border-[var(--rule)] bg-white/70 hover:bg-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  {/* A garment colour, not a UI token (DESIGN-SYSTEM §3). */}
                  <span
                    className={`h-7 w-7 shrink-0 border border-black/10 ${
                      isSelected
                        ? "outline outline-2 outline-offset-1 outline-[var(--ink-black)]"
                        : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="text-fine font-bold text-[var(--ink-black)]">
                    {color.name}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="spec mt-1 block h-4 text-spec font-bold text-[var(--gorilla-green)]"
                >
                  {isSelected ? "SELECTED" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The two pricing outcomes Gabe asked for, as the question itself. */}
      <div data-invalid={fieldErrors?.printLocations ? "true" : undefined}>
        <p className="eyebrow">What gets printed</p>
        <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
          Up to {HOODIE_SPECIAL.maxInksPerSide} ink colors on each side. Setup
          and screens are included.
        </p>

        <div
          className={`mt-3 grid grid-cols-1 gap-3 border-2 sm:grid-cols-2 ${
            fieldErrors?.printLocations
              ? "border-[var(--rush-red)]"
              : "border-transparent"
          }`}
          role="group"
          aria-describedby={
            fieldErrors?.printLocations ? "hoodie-special-print-error" : undefined
          }
        >
          <Chip
            label={`Front print — ${money(HOODIE_SPECIAL.frontPrice)} each`}
            selected={sides === "front"}
            onSelect={() => onSelectSides("front")}
          />
          <Chip
            label={`Front and back — ${money(HOODIE_SPECIAL.frontAndBackPrice)} each`}
            selected={sides === "frontAndBack"}
            onSelect={() => onSelectSides("frontAndBack")}
          />
        </div>

        {fieldErrors?.printLocations && (
          <p
            id="hoodie-special-print-error"
            className="mt-2 text-fine font-bold text-[var(--rush-red)]"
          >
            {fieldErrors.printLocations}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
          Where on the front
        </p>
        {placementChips("front", frontLocation)}
      </div>

      <OptionSelector
        title="Ink colors — front"
        options={HOODIE_SPECIAL_INK_OPTIONS}
        selected={inkColorsByLocation[frontLocation] || inkColors}
        onSelect={(ink) => onSelectInk(frontLocation, ink)}
      />

      {backLocation && (
        <>
          <div className="space-y-3">
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Where on the back
            </p>
            {placementChips("back", backLocation)}
          </div>

          <OptionSelector
            title="Ink colors — back"
            options={HOODIE_SPECIAL_INK_OPTIONS}
            selected={inkColorsByLocation[backLocation] || inkColors}
            onSelect={(ink) => onSelectInk(backLocation, ink)}
          />
        </>
      )}

      {/* The cap is the special's, and the menu above already holds to it.
          This is for the art: if the file reads as busier than two colours,
          the quote does not go through until the customer ticks that it
          prints in two a side, or leaves for a regular quote. The count is
          an estimate (a background or soft edges read as extra colours), so
          it asks rather than refuses (Gabe, 2026-11-23: no breaking the
          2-colour rule). */}
      <p className="-mt-2 text-fine font-medium leading-5 text-[var(--ink-muted)]">
        Need 3 or more colors on a side?{" "}
        <button
          type="button"
          onClick={onLeave}
          className="cursor-pointer font-bold text-[var(--ink-black)] underline underline-offset-2"
        >
          Use a regular quote
        </button>{" "}
        instead.
      </p>

      {artTooBusy && (
        <div
          role="status"
          data-testid="hoodie-special-art-warning"
          className="border border-[var(--rule)] border-l-4 border-l-[var(--rush-red)] bg-[var(--surface-warn)] p-4 text-fine font-medium leading-6 text-[var(--ink-black)]"
        >
          <p>
            Your artwork looks like it has about {artworkColorCount} colors.
            The special prints {HOODIE_SPECIAL.maxInksPerSide} colors per side
            at most, with no exceptions. If your art needs more, use a regular
            quote.
          </p>
          <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 font-bold">
            <input
              type="checkbox"
              data-testid="hoodie-special-art-confirm"
              checked={artConfirmed}
              onChange={(event) => onConfirmArt(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--ink-black)]"
            />
            My art prints in {HOODIE_SPECIAL.maxInksPerSide} colors or fewer on
            each side (a background color doesn&rsquo;t count).
          </label>
          {fieldErrors?.artwork && !artConfirmed && (
            <p className="mt-2 font-bold text-[var(--rush-red)]">
              {fieldErrors.artwork}
            </p>
          )}
        </div>
      )}

      {/* Sizes ARE the count here: there is no rough quantity, because the
          price does not need one and the special needs a real run. */}
      <div
        data-invalid={fieldErrors?.quantity ? "true" : undefined}
        className={fieldErrors?.quantity ? "border-2 border-[var(--rush-red)]" : ""}
      >
        <SizeBreakdownGrid
          title="Sizes (required)"
          description={`One price for every size, XS to 5XL. ${HOODIE_SPECIAL.minPieces} hoodies or more.`}
          sizes={HOODIE_SPECIAL.sizes.map((sizeName) => ({
            sizeName,
            isAvailable: true,
          }))}
          quantities={sizeQuantities}
          onStep={onStepSize}
          onSet={onSetSize}
          onReset={onResetSizes}
          labelPrefix="Hoodie"
        />

        {fieldErrors?.quantity ? (
          <p className="mt-2 px-1 text-fine font-bold text-[var(--rush-red)]">
            {fieldErrors.quantity}
          </p>
        ) : (
          short > 0 && (
            <p
              role="status"
              data-testid="hoodie-special-short"
              className="mt-2 px-1 text-fine font-bold text-[var(--ink-black)]"
            >
              {sizeTotal === 0
                ? `Enter your sizes. The special starts at ${HOODIE_SPECIAL.minPieces} hoodies.`
                : `${sizeTotal} so far. Add ${short} more to reach ${HOODIE_SPECIAL.minPieces}.`}
            </p>
          )
        )}
      </div>
    </>
  );
}

/**
 * The starburst's outline: 28 spikes, the inner points at 86% of the outer
 * radius, as a clip-path polygon. Computed once; a shape, not a colour.
 */
const STARBURST_POINTS = 28;
const STARBURST_CLIP = `polygon(${Array.from(
  { length: STARBURST_POINTS * 2 },
  (_, i) => {
    const radius = i % 2 === 0 ? 50 : 43;
    const angle = (Math.PI * i) / STARBURST_POINTS - Math.PI / 2;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  }
).join(", ")})`;

/**
 * The landing-page ad for the special (Gabe, 2026-11-23: "add a advertisement
 * for the hoodie special on the landing page once you press the link to get
 * to the order", then: "The ad for the special could occupy the space to the
 * right of the page. Make the ad inside a spiked circle that's typical for
 * eye catching announcements").
 *
 * A starburst badge. On wide screens the page pins it in the empty space to
 * the right of the hero headline; on narrower ones it sits under the
 * headline. The page shows it only while the special is open
 * (isHoodieSpecialOpen(), the same Salem-clock rule that hides the apparel
 * step's button after the last day).
 *
 * The whole badge is the button. It does what a customer would otherwise do
 * in three moves: pick T-Shirts & Apparel, continue, press the special's
 * button. The page owns that; this is only the ad.
 *
 * Every figure is read from HOODIE_SPECIAL, so the ad cannot advertise a
 * price, minimum or date the quote does not charge. No hoodie photo: the
 * special's only blank is Cutter & Buck's, which S&S does not carry.
 *
 * Off-system on purpose in one way: the house is square and flat, and an
 * announcement burst is neither. It keeps the system's other rules: brand
 * green, a hard offset in ink black rather than a blur, ink inversion on
 * hover, the 2px focus ring.
 */
export function HoodieSpecialAd({ onStart }: { onStart: () => void }) {
  // Gabe, 2026-11-23: "Less info, have it say '50 hoodies, as low as $27
  // each!'". The lower of the special's two prices, so it stays true.
  const fromPrice = Math.min(
    HOODIE_SPECIAL.frontPrice,
    HOODIE_SPECIAL.frontAndBackPrice
  );
  const headline = `${HOODIE_SPECIAL.minPieces} hoodies, as low as $${fromPrice} each!`;

  return (
    <button
      type="button"
      data-testid="hoodie-special-ad"
      onClick={onStart}
      aria-label={`${headline} Start the ${HOODIE_SPECIAL.name}.`}
      className="group relative mx-auto mt-8 block aspect-square w-[18rem] shrink-0 cursor-pointer -rotate-6 motion-safe:animate-jiggle hover:animate-none focus-visible:animate-none transition-transform duration-[120ms] ease-linear hover:rotate-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gorilla-green)] active:translate-x-[2px] active:translate-y-[2px] sm:w-[20rem] xl:absolute xl:right-0 xl:top-0 xl:mt-0"
    >
      {/* The hard offset: the same burst in ink black, 6px down-right. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-[6px] translate-y-[6px] bg-[var(--ink-black)]"
        style={{ clipPath: STARBURST_CLIP }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--gorilla-green)] transition-colors duration-[120ms] ease-linear group-hover:bg-[var(--ink-black)]"
        style={{ clipPath: STARBURST_CLIP }}
      />

      <span
        aria-hidden="true"
        className="relative flex h-full flex-col items-center justify-center px-12 text-center text-white"
      >
        <span className="text-display font-bold leading-[0.9] tracking-display">
          {HOODIE_SPECIAL.minPieces} hoodies,
        </span>
        <span className="mt-3 text-value font-bold">as low as</span>
        <span
          data-testid="hoodie-special-ad-price"
          className="mt-1 text-display font-bold leading-[0.9] tracking-display"
        >
          ${fromPrice} each!
        </span>
      </span>
    </button>
  );
}
