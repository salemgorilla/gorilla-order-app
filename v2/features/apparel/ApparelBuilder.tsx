"use client";

import OptionSelector from "../../components/OptionSelector";
import SpecialOrderEscape from "../../components/SpecialOrderEscape";
import SizeBreakdownGrid from "./SizeBreakdownGrid";
import { apparelCatalog, type ApparelQuote } from "../../lib/apparel";
import type { ArtworkAnalysis } from "../../lib/artwork";
import type { FieldErrors } from "../../lib/validation";
import type {
  SsCatalogColor,
  SsCatalogProduct,
  SsCatalogSize,
} from "../types";

type Props = {
  apparelQuote: ApparelQuote;
  artworkAnalysis: ArtworkAnalysis | null;

  ssCatalogStatus: "idle" | "loading" | "loaded" | "error";
  hasSsProducts: boolean;
  filteredSsProducts: SsCatalogProduct[];
  apparelCategories: string[];
  selectedApparelCategory: string;
  selectedSsProduct: SsCatalogProduct | null;
  selectedSsColor: SsCatalogColor | null;
  selectedSsSize: SsCatalogSize | null;

  sizeOptionsForBreakdown: string[];
  sizeQuantities: Record<string, number>;

  /** Only populated after a failed submit; empty until then. */
  fieldErrors?: FieldErrors;

  onSelectCategory: (category: string) => void;
  onSelectProduct: (product: SsCatalogProduct) => void;
  onSelectColor: (color: SsCatalogColor) => void;
  onSelectSize: (size: SsCatalogSize) => void;
  onSelectGarmentType: (garmentType: string) => void;
  onSelectFallbackGarmentColor: (garmentColor: string) => void;
  onTogglePrintLocation: (location: string) => void;
  onSelectInkColors: (inkColors: string) => void;
  /** Ink for ONE placement — Gabe: "Front is 2 color, back is 1." */
  onSelectLocationInkColors: (location: string, inkColors: string) => void;
  onUpdateSpecialOrder: (updates: {
    specialOrder?: boolean;
    specialOrderNotes?: string;
  }) => void;
  onUpdateSizeQuantity: (sizeName: string, change: number) => void;
  onSetSizeQuantity: (sizeName: string, value: number) => void;
  onResetSizeBreakdown: () => void;
  /**
   * The rough count that gives the estimate a quantity BEFORE any size is
   * entered. The size grid's total replaces it the moment the grid holds
   * anything — grid wins, no reconciliation, see the apparelQuote memo.
   */
  onSetRoughQuantity: (quantity: number) => void;
  /** True once the size grid holds anything — the rough count is then retired. */
  sizesEntered: boolean;
};

export default function ApparelBuilder({
  apparelQuote,
  artworkAnalysis,
  ssCatalogStatus,
  hasSsProducts,
  filteredSsProducts,
  apparelCategories,
  selectedApparelCategory,
  selectedSsProduct,
  selectedSsColor,
  selectedSsSize,
  sizeOptionsForBreakdown,
  sizeQuantities,
  fieldErrors,
  onSelectCategory,
  onSelectProduct,
  onSelectColor,
  onSelectSize,
  onSelectGarmentType,
  onSelectFallbackGarmentColor,
  onTogglePrintLocation,
  onSelectInkColors,
  onSelectLocationInkColors,
  onUpdateSpecialOrder,
  onUpdateSizeQuantity,
  onSetSizeQuantity,
  onResetSizeBreakdown,
  onSetRoughQuantity,
  sizesEntered,
}: Props) {
  return (
    <>
      {/* No quantity picker. Quantity comes from the size grid below — asking
          for it twice is what created the "size breakdown must total 24"
          error, and it made the customer's first decision a number they had
          no basis for choosing. */}
      <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">
              Garment Catalog
            </p>
            <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
              Real garments with live colors, sizes, prices and
              availability.
            </p>
          </div>

          {/* Only shown while something is actually happening. This used to
              print internal fetch state in the panel's most prominent slot,
              and its idle branch said "Ready" — which a customer reads as a
              promise about their order but only meant "the fetch has not
              started". A loaded catalogue needs no announcement. */}
          {ssCatalogStatus === "loading" && (
            <span className="spec bg-white px-3 py-2 text-spec font-bold text-[var(--ink-muted)]">
              LOADING GARMENTS
            </span>
          )}
        </div>

        {/* The customer gets told what it means for THEIR order, never the
            integration's own words.

            This rendered `ssCatalogError` raw, which is whatever the upstream
            threw — so while the S&S credentials were being rejected, every
            customer who opened apparel was shown:

              Style 39 failed with 401: { "message": "Authorization has been
              denied for this request." }

            in red, in the panel's most prominent slot. Alarming, meaningless
            to them, and it names an internal integration and its failure mode
            to the public.

            The fallback below is genuinely fine — the local garment list still
            lets them pick and submit, and apparel is hand-quoted anyway — so
            this is not even bad news for their order. It just has to say so.

            The raw text is not lost: it goes to console.error in loadSsCatalog
            and to /api/health, which is admin-guarded and where a diagnostic
            belongs. */}
        {ssCatalogStatus === "error" && (
          <div className="mb-4 bg-white p-4 text-fine font-bold leading-6 text-[var(--ink-black)]">
            Our live garment list is unavailable right now, so prices are not
            shown here. Pick the style and colour you want and send it through
            — Gorilla Salem quotes apparel by hand and will confirm pricing,
            usually the same day.
          </div>
        )}

        {hasSsProducts ? (
          <div className="space-y-5">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
                  Garment Style
                </p>

                <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
                  {filteredSsProducts.length} shown
                </p>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {apparelCategories.map((category) => {
                  const isSelected = selectedApparelCategory === category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => onSelectCategory(category)}
                      // A filter, not a choice of garment — but still a
                      // toggle, and it was not announcing its state.
                      aria-pressed={isSelected}
                      className={` cursor-pointer px-4 py-2 text-fine font-bold transition ${
                        isSelected
                          ? "bg-[var(--gorilla-green)] text-white"
                          : "bg-white text-[var(--gorilla-green)] hover:bg-[var(--surface-ok)]"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3">
                {filteredSsProducts.map((product) => {
                  const isSelected = selectedSsProduct?.id === product.id;
                  const thumbnailColor =
                    product.colors.find((color) => color.frontImage) ||
                    product.colors[0];

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      /**
                       * Same treatment as the colour swatches below and the
                       * product cards a step earlier — Gabe, 2026-09-07:
                       * "do the same highlight method for the garment choices
                       * too."
                       *
                       * It had the identical defect: white-on-white/70 and a
                       * 1px border changing colour, with no aria-pressed. No
                       * ring on the thumbnail though, and that is deliberate.
                       * The swatch gets one because the swatch IS the thing
                       * being chosen; here the photograph only illustrates a
                       * card, and ringing it would point at the wrong object.
                       */
                      aria-pressed={isSelected}
                      className={` cursor-pointer border p-4 text-left transition ${
                        isSelected
                          ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                          : "border-[var(--rule)] bg-white/70 hover:bg-white"
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden border border-[var(--rule)] bg-[var(--shirt-blank)]">
                          {thumbnailColor?.frontImage ? (
                            <img
                              src={thumbnailColor.frontImage}
                              alt={`${product.customerLabel || product.displayName} preview`}
                              className="h-full w-full object-contain p-2"
                            />
                          ) : (
                            <span className="px-2 text-center text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
                              No Image
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-[var(--ink-black)]">
                                {product.customerLabel || product.displayName}
                              </p>
                              <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                                {product.customerCategory}
                              </p>
                            </div>

                            {/* The badge leads the right-hand cluster, in the
                                same place the product cards put theirs. The
                                row already wraps, so adding it cannot crush
                                the colour count beside it. */}
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {isSelected && (
                                <span className="spec bg-[var(--gorilla-green)] px-2 py-1 text-spec font-bold text-white">
                                  SELECTED
                                </span>
                              )}

                              <span className=" bg-[var(--shirt-blank)] px-3 py-1 text-spec font-bold uppercase tracking-eyebrow text-[var(--gorilla-green)]">
                                {product.colors.length} colors
                              </span>
                            </div>
                          </div>

                          {thumbnailColor?.colorName && (
                            <p className="mt-3 text-spec font-medium text-[var(--ink-muted)]">
                              Preview shown in {thumbnailColor.colorName}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedSsProduct && (
              <div>
                <p className="mb-3 text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
                  Garment Color
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedSsProduct.colors.map((color) => {
                    const isSelected =
                      selectedSsColor?.colorName === color.colorName;

                    return (
                      <button
                        key={color.colorName}
                        type="button"
                        onClick={() => onSelectColor(color)}
                        disabled={color.outOfStock}
                        /**
                         * Reported by Gabe, 2026-09-07: "when I press a color
                         * there is no indication, or not one very visible, to
                         * know that the color has been chosen."
                         *
                         * He was right, and it was worse than invisible — it
                         * was inaccessible. The entire selected state was a
                         * 1px border changing colour and the fill going from
                         * white/70 to white: two colour-only signals, one of
                         * them at 30% opacity, in a grid of up to 84 cells.
                         * There was no aria-pressed either, so assistive tech
                         * was told nothing at all.
                         *
                         * This is the product cards' own treatment, one step
                         * earlier in the same flow: green border, GREEN TINT
                         * fill rather than white-on-white, and an explicit
                         * SELECTED badge that survives greyscale and
                         * colour-blindness. The border stays 1px on purpose —
                         * the product card's note explains why a 1px→2px step
                         * is avoided here: it shifts the layout.
                         */
                        aria-pressed={isSelected}
                        className={` border p-3 text-left transition ${
                          isSelected
                            ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                            : "border-[var(--rule)] bg-white/70 hover:bg-white"
                        } ${
                          color.outOfStock
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {/* The chosen colour gets a ring on the swatch
                              itself, drawn as an OUTLINE rather than a border
                              so a 28px chip cannot nudge the row as it is
                              selected. Ink, not green: the swatch may itself
                              be green, and a green ring on a green swatch is
                              no ring at all. */}
                          {color.swatchImage ? (
                            <img
                              src={color.swatchImage}
                              alt={color.colorName}
                              className={`h-7 w-7 border border-black/10 object-cover ${
                                isSelected
                                  ? "outline outline-2 outline-offset-1 outline-[var(--ink-black)]"
                                  : ""
                              }`}
                            />
                          ) : (
                            <span
                              className={`h-7 w-7 border border-black/10 ${
                                isSelected
                                  ? "outline outline-2 outline-offset-1 outline-[var(--ink-black)]"
                                  : ""
                              }`}
                              style={{
                                backgroundColor:
                                  color.colorHex || "#ffffff",
                              }}
                            />
                          )}

                          <span className="text-fine font-bold text-[var(--ink-black)]">
                            {color.colorName}
                          </span>
                        </div>

                        {/* The status slot, reused rather than added to: the
                            badge takes the line "Available" was on, so
                            selecting a colour cannot reflow the grid. An
                            out-of-stock colour is disabled and can never be
                            the selected one, so the three states never
                            collide. */}
                        {isSelected ? (
                          <span className="spec mt-2 inline-block bg-[var(--gorilla-green)] px-2 py-1 text-spec font-bold text-white">
                            SELECTED
                          </span>
                        ) : (
                          <p className="mt-2 text-spec font-medium text-[var(--ink-muted)]">
                            {color.outOfStock ? "Out of stock" : "Available"}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedSsColor && (
              <div>
                <p className="mb-3 text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
                  Garment Prices by Size
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {selectedSsColor.sizes.map((size) => {
                    const isSelected =
                      selectedSsSize?.sizeName === size.sizeName;

                    return (
                      <button
                        key={size.sku}
                        type="button"
                        onClick={() => onSelectSize(size)}
                        disabled={size.outOfStock}
                        // Same defect as its two siblings above, so the same
                        // fix — otherwise this panel would carry two ways of
                        // saying "chosen" and one way of saying nothing.
                        aria-pressed={isSelected}
                        className={` border p-3 text-center transition ${
                          isSelected
                            ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                            : "border-[var(--rule)] bg-white/70 hover:bg-white"
                        } ${
                          size.outOfStock
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer"
                        }`}
                      >
                        <p className="text-fine font-bold text-[var(--ink-black)]">
                          {size.sizeName}
                        </p>
                        <p className="mt-1 text-spec font-bold text-[var(--ink-muted)]">
                          ${size.markedUpPrice.toFixed(2)}
                        </p>

                        {/* A RESERVED slot, always rendered — the StepNav
                            glyph trick. These cells sit in a grid, so a word
                            appearing in one would grow every cell in its row
                            and shuffle the sizes under the pointer. Empty and
                            present costs four pixels and moves nothing. */}
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

                <p className="mt-3 text-spec font-medium leading-5 text-[var(--ink-muted)]">
                  Shirt price by size, before printing. Printing and
                  screens are added in the estimate.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <OptionSelector
              title="Garment Type"
              options={apparelCatalog.garmentTypes}
              selected={apparelQuote.garmentType}
              onSelect={(garmentType) => onSelectGarmentType(garmentType)}
            />

            <OptionSelector
              title="Garment Color"
              options={apparelCatalog.garmentColors}
              selected={apparelQuote.garmentColor}
              onSelect={(garmentColor) =>
                onSelectFallbackGarmentColor(garmentColor)
              }
            />
          </div>
        )}
      </div>

      {/* The quantity the estimate stands on until sizes exist. Stacey Beer
          submitted three times hunting for a number she could negotiate
          against; this is where that number gets its count. The size grid
          below REPLACES this the moment it holds anything — grid wins, no
          reconciliation error, see the apparelQuote memo in page.tsx. */}
      <div
        className={` bg-[var(--shirt-blank)] p-5 ${
          fieldErrors?.quantity
            ? "border-2 border-[var(--rush-red)]"
            : "border border-[var(--rule)]"
        }`}
        data-invalid={fieldErrors?.quantity ? "true" : undefined}
      >
        <label className="block">
          <span className="text-fine font-semibold text-[var(--ink-black)]">
            How many do you need?
          </span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={apparelQuote.quantity || ""}
            onFocus={(event) => event.target.select()}
            onChange={(event) => onSetRoughQuantity(Number(event.target.value))}
            disabled={sizesEntered}
            aria-invalid={fieldErrors?.quantity ? true : undefined}
            aria-describedby={
              fieldErrors?.quantity ? "apparel-quantity-error" : undefined
            }
            className="spec mt-2 h-12 w-32 bg-white px-3 text-center text-value font-bold text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--gorilla-green)] disabled:opacity-50"
          />
        </label>

        <p className="mt-2 text-fine font-medium leading-5 text-[var(--ink-muted)]">
          {sizesEntered
            ? "Counting your entered sizes below — clear them to type a rough total again."
            : "A rough count is fine — the estimate updates as you change it. Enter your sizes below and it becomes exact."}
        </p>

        {fieldErrors?.quantity && (
          <p
            id="apparel-quantity-error"
            className="mt-2 text-fine font-bold text-[var(--rush-red)]"
          >
            {fieldErrors.quantity}
          </p>
        )}
      </div>

      {/* The SAME control every added garment gets — see
          SizeBreakdownGrid for why it is one component and not two.

          Directly under the rough count, because it REPLACES it. It used to
          sit at the bottom of the step, three sections below the box it
          overrides and after the print questions — so a customer answered
          "how many", answered two unrelated questions, then met a second
          way to answer the first one. An added garment always had the two
          together (there was nowhere else to put them), which is the layout
          both now use. */}
      <SizeBreakdownGrid
        title="Size Breakdown"
        description="Optional for the estimate — enter your sizes and the price becomes exact. We confirm sizes before printing either way."
        sizes={sizeOptionsForBreakdown.map((sizeName) => ({
          sizeName,
          isAvailable:
            selectedSsColor?.sizes.find((size) => size.sizeName === sizeName)
              ?.isAvailable ?? true,
        }))}
        quantities={sizeQuantities}
        onStep={onUpdateSizeQuantity}
        onSet={onSetSizeQuantity}
        onReset={onResetSizeBreakdown}
      />

      <div data-invalid={fieldErrors?.printLocations ? "true" : undefined}>
        <div className="mb-3">
          <p className="eyebrow">
            Print Locations
          </p>
          <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
            Choose all that apply.
          </p>
        </div>

        {/* The 2px frame is always in the box model and only changes ink, so
            marking this group never reflows the page under the customer. */}
        <div
          className={`grid grid-cols-2 gap-3 border-2 ${
            fieldErrors?.printLocations
              ? "border-[var(--rush-red)]"
              : "border-transparent"
          }`}
          role="group"
          // Described, not aria-invalid: a group has no value to be invalid,
          // and the message it points at states the problem in words.
          aria-describedby={
            fieldErrors?.printLocations ? "print-locations-error" : undefined
          }
        >
          {apparelCatalog.printLocations.map((location) => {
            const isSelected = apparelQuote.printLocations.includes(location);

            return (
              <button
                key={location}
                type="button"
                onClick={() => onTogglePrintLocation(location)}
                className={` border px-4 py-4 text-fine font-bold transition ${
                  isSelected
                    ? "border-[var(--gorilla-green)] bg-[var(--gorilla-green)] text-white"
                    : "border-[var(--rule)] bg-[var(--shirt-blank)] text-[var(--ink-black)] hover:bg-white"
                }`}
              >
                {location}
              </button>
            );
          })}
        </div>

        {fieldErrors?.printLocations && (
          <p
            id="print-locations-error"
            className="mt-2 text-fine font-bold text-[var(--rush-red)]"
          >
            {fieldErrors.printLocations}
          </p>
        )}
      </div>

      {/* One ink question per placement.
          Gabe, 2026-09-07: "Each location should offer options for print
          color amount. An order could be: Front is 2 color, back is 1."
          One count for the whole order made a two-colour front force the
          back to two colours, so the customer paid for a screen nobody
          burned. Each selected location now answers for itself, and a
          location left alone keeps the order-level value below it.

          Before any location is chosen there is nothing to ask per
          placement, so the plain question stands in and sets the default
          every location inherits. */}
      {apparelQuote.printLocations.length > 0 ? (
        apparelQuote.printLocations.map((location) => (
          <OptionSelector
            key={location}
            title={`Ink Colors — ${location}`}
            options={apparelCatalog.inkColors}
            selected={
              apparelQuote.inkColorsByLocation?.[location] ||
              apparelQuote.inkColors
            }
            onSelect={(inkColors) =>
              onSelectLocationInkColors(location, inkColors)
            }
          />
        ))
      ) : (
        <OptionSelector
          title="Ink Colors"
          options={apparelCatalog.inkColors}
          selected={apparelQuote.inkColors}
          onSelect={(inkColors) => onSelectInkColors(inkColors)}
        />
      )}

      {/* The same control signs use — see components/SpecialOrderEscape for
          why it is one component and why it is never a heuristic on the
          notes field. Apparel's consequence line differs from the other
          flows': it has no payment link to withhold, only a number. */}
      <SpecialOrderEscape
        idPrefix="apparel-special-order"
        checked={Boolean(apparelQuote.specialOrder)}
        notes={apparelQuote.specialOrderNotes || ""}
        examples="Different garment (crewneck, long sleeve, youth, hats), another print location (left chest, sleeve, tag), embroidery, or anything custom."
        placeholder="e.g. 40 crewnecks, left chest logo + full back, plus 12 embroidered hats"
        consequence="Heads up: special orders don't get an online price. Everything you fill in above still comes through — Gorilla Salem will price it and reply."
        error={fieldErrors?.specialOrderNotes}
        onChange={onUpdateSpecialOrder}
      />

      {artworkAnalysis?.estimatedColorCount && (
        <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
          <p className="eyebrow">
            Auto Color Count
          </p>

          <div className="mt-3 grid gap-3 text-fine font-bold text-[var(--ink-muted)] sm:grid-cols-3">
            <div className=" bg-white p-3">
              <p className="text-spec uppercase tracking-eyebrow">
                Artwork
              </p>
              <p className="mt-1 text-value font-bold text-[var(--ink-black)]">
                {artworkAnalysis.estimatedColorCount} colors
              </p>
            </div>

            <div className=" bg-white p-3">
              <p className="text-spec uppercase tracking-eyebrow">
                Underbase
              </p>
              <p className="mt-1 text-value font-bold text-[var(--ink-black)]">
                {apparelQuote.garmentColor === "White"
                  ? "+0"
                  : "+1 white"}
              </p>
            </div>

            <div className=" bg-white p-3">
              <p className="text-spec uppercase tracking-eyebrow">
                Suggested
              </p>
              <p className="mt-1 text-value font-bold text-[var(--ink-black)]">
                {apparelQuote.inkColors}
              </p>
            </div>
          </div>

          <p className="mt-3 text-spec font-bold leading-5 text-[var(--ink-muted)]">
            This is an estimate. If the shirt color is not white, the
            app adds one extra color for a white underbase.
          </p>
        </div>
      )}

    </>
  );
}
