"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
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
  sizeQuantityTotal: number;
  sizeBreakdownFromButtons: string;
  sizeBreakdownMatchesQuantity: boolean;

  /** Only populated after a failed submit; empty until then. */
  fieldErrors?: FieldErrors;

  onSelectQuantity: (quantity: number) => void;
  onSelectCategory: (category: string) => void;
  onSelectProduct: (product: SsCatalogProduct) => void;
  onSelectColor: (color: SsCatalogColor) => void;
  onSelectSize: (size: SsCatalogSize) => void;
  onSelectGarmentType: (garmentType: string) => void;
  onSelectFallbackGarmentColor: (garmentColor: string) => void;
  onTogglePrintLocation: (location: string) => void;
  onSelectInkColors: (inkColors: string) => void;
  onUpdateSpecialOrder: (updates: {
    specialOrder?: boolean;
    specialOrderNotes?: string;
  }) => void;
  onUpdateSizeQuantity: (sizeName: string, change: number) => void;
  onSetSizeQuantity: (sizeName: string, value: number) => void;
  onResetSizeBreakdown: () => void;
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
  sizeQuantityTotal,
  sizeBreakdownFromButtons,
  sizeBreakdownMatchesQuantity,
  fieldErrors,
  onSelectQuantity,
  onSelectCategory,
  onSelectProduct,
  onSelectColor,
  onSelectSize,
  onSelectGarmentType,
  onSelectFallbackGarmentColor,
  onTogglePrintLocation,
  onSelectInkColors,
  onUpdateSpecialOrder,
  onUpdateSizeQuantity,
  onSetSizeQuantity,
  onResetSizeBreakdown,
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
              Live S&S Catalog
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              Products, colors, sizes, pricing, availability, and images
              are pulled from S&S.
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
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                  Garment Style
                </p>

                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
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
                      className={` px-4 py-2 text-sm font-bold transition ${
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
                      className={` border p-4 text-left transition ${
                        isSelected
                          ? "border-[var(--gorilla-green)] bg-white"
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
                            <span className="px-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
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
                              <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                                {product.customerCategory} • Style{" "}
                                {product.catalogStyle}
                              </p>
                              <p className="mt-1 text-xs font-bold text-[var(--ink-muted)]">
                                S&S: {product.displayName}
                              </p>
                            </div>

                            <span className=" bg-[var(--shirt-blank)] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gorilla-green)]">
                              {product.colors.length} colors
                            </span>
                          </div>

                          {thumbnailColor?.colorName && (
                            <p className="mt-3 text-xs font-bold text-[var(--ink-muted)]">
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
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
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
                        className={` border p-3 text-left transition ${
                          isSelected
                            ? "border-[var(--gorilla-green)] bg-white"
                            : "border-[var(--rule)] bg-white/70 hover:bg-white"
                        } ${
                          color.outOfStock
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {color.swatchImage ? (
                            <img
                              src={color.swatchImage}
                              alt={color.colorName}
                              className="h-7 w-7 border border-black/10 object-cover"
                            />
                          ) : (
                            <span
                              className="h-7 w-7 border border-black/10"
                              style={{
                                backgroundColor:
                                  color.colorHex || "#ffffff",
                              }}
                            />
                          )}

                          <span className="text-sm font-bold text-[var(--ink-black)]">
                            {color.colorName}
                          </span>
                        </div>

                        <p className="mt-2 text-xs font-bold text-[var(--ink-muted)]">
                          {color.outOfStock ? "Out of stock" : "Available"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedSsColor && (
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                  Sample Size / Garment Price
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
                        className={` border p-3 text-center transition ${
                          isSelected
                            ? "border-[var(--gorilla-green)] bg-white"
                            : "border-[var(--rule)] bg-white/70 hover:bg-white"
                        } ${
                          size.outOfStock
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }`}
                      >
                        <p className="text-sm font-bold text-[var(--ink-black)]">
                          {size.sizeName}
                        </p>
                        <p className="mt-1 text-xs font-bold text-[var(--ink-muted)]">
                          ${size.markedUpPrice.toFixed(2)}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs font-bold leading-5 text-[var(--ink-muted)]">
                  This garment price includes the 40% markup over S&S
                  customer pricing. Print/decorating costs are added later.
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

      <div data-invalid={fieldErrors?.printLocations ? "true" : undefined}>
        <div className="mb-3">
          <p className="eyebrow">
            Print Locations
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
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
                className={` border px-4 py-4 text-sm font-bold transition ${
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

      <OptionSelector
        title="Ink Colors"
        options={apparelCatalog.inkColors}
        selected={apparelQuote.inkColors}
        onSelect={(inkColors) => onSelectInkColors(inkColors)}
      />

      <div
        className={` border p-4 transition ${
          apparelQuote.specialOrder
            ? "border-[var(--rush-red)] bg-[var(--surface-rush)]"
            : "border-[var(--rule)] bg-[var(--shirt-blank)]"
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={apparelQuote.specialOrder}
            onChange={(event) =>
              onUpdateSpecialOrder({ specialOrder: event.target.checked })
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--rush-red)]"
          />
          <span>
            <span className="block text-sm font-bold text-[var(--ink-black)]">
              I need something not listed here
            </span>
            <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
              Different garment (crewneck, long sleeve, youth, hats), another
              print location (left chest, sleeve, tag), embroidery, or anything
              custom. We&apos;ll quote it by hand.
            </span>
          </span>
        </label>

        {apparelQuote.specialOrder && (
          <div
            className="mt-4"
            data-invalid={fieldErrors?.specialOrderNotes ? "true" : undefined}
          >
            <label className="block">
              <span className="text-sm font-bold text-[var(--ink-black)]">
                Tell us what you need
              </span>
              <textarea
                value={apparelQuote.specialOrderNotes}
                onChange={(event) =>
                  onUpdateSpecialOrder({
                    specialOrderNotes: event.target.value,
                  })
                }
                rows={3}
                placeholder="e.g. 40 crewnecks, left chest logo + full back, plus 12 embroidered hats"
                aria-invalid={fieldErrors?.specialOrderNotes ? true : undefined}
                aria-describedby={
                  fieldErrors?.specialOrderNotes
                    ? "special-order-notes-error"
                    : undefined
                }
                className={`mt-2 w-full bg-white px-4 py-3 font-bold text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--rush-red)] ${
                  fieldErrors?.specialOrderNotes
                    ? "border-2 border-[var(--rush-red)]"
                    : "border border-[var(--rule)]"
                }`}
              />
            </label>

            {fieldErrors?.specialOrderNotes && (
              <p
                id="special-order-notes-error"
                className="mt-1 text-fine font-bold text-[var(--rush-red)]"
              >
                {fieldErrors.specialOrderNotes}
              </p>
            )}

            <p className="mt-3 bg-white p-3 text-xs font-bold leading-5 text-[var(--ink-muted)]">
              Heads up: special orders don&apos;t get an online price. Everything
              you fill in above still comes through — Gorilla Salem will price it
              and reply.
            </p>
          </div>
        )}
      </div>

      {artworkAnalysis?.estimatedColorCount && (
        <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
          <p className="eyebrow">
            Auto Color Count
          </p>

          <div className="mt-3 grid gap-3 text-sm font-bold text-[var(--ink-muted)] sm:grid-cols-3">
            <div className=" bg-white p-3">
              <p className="text-xs uppercase tracking-[0.12em]">
                Artwork
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--ink-black)]">
                {artworkAnalysis.estimatedColorCount} colors
              </p>
            </div>

            <div className=" bg-white p-3">
              <p className="text-xs uppercase tracking-[0.12em]">
                Underbase
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--ink-black)]">
                {apparelQuote.garmentColor === "White"
                  ? "+0"
                  : "+1 white"}
              </p>
            </div>

            <div className=" bg-white p-3">
              <p className="text-xs uppercase tracking-[0.12em]">
                Suggested
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--ink-black)]">
                {apparelQuote.inkColors}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs font-bold leading-5 text-[var(--ink-muted)]">
            This is an estimate. If the shirt color is not white, the
            app adds one extra color for a white underbase.
          </p>
        </div>
      )}

      <div
        className={` bg-[var(--shirt-blank)] p-5 ${
          fieldErrors?.sizeBreakdown
            ? "border-2 border-[var(--rush-red)]"
            : "border border-[var(--rule)]"
        }`}
        data-invalid={fieldErrors?.sizeBreakdown ? "true" : undefined}
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">
              Size Breakdown
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              Use the buttons to make the total match the quantity.
            </p>
          </div>

          <span
            className={` px-4 py-2 text-sm font-bold ${
              sizeBreakdownMatchesQuantity
                ? "bg-[var(--gorilla-green)] text-white"
                : "bg-white text-[var(--rush-red)]"
            }`}
          >
            {/* Just the total. "12 / 12" was reconciliation feedback for a
                second number that no longer exists. */}
            {sizeQuantityTotal} {sizeQuantityTotal === 1 ? "shirt" : "shirts"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {sizeOptionsForBreakdown.map((sizeName) => {
            const quantity = sizeQuantities[sizeName] || 0;
            const sizeRecord = selectedSsColor?.sizes.find(
              (size) => size.sizeName === sizeName
            );
            const isAvailable = sizeRecord?.isAvailable ?? true;
            // Adding is capped only by stock now. It used to also stop at the
            // separately chosen quantity — with quantity derived from this
            // grid, that test is always false and would freeze every + button.
            const canAdd = isAvailable;

            return (
              <div
                key={sizeName}
                className={` border bg-white p-4 ${
                  isAvailable
                    ? "border-[var(--rule)]"
                    : "border-[var(--rule)] opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-[var(--ink-black)]">
                      {sizeName}
                    </p>

                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      {isAvailable ? "Available" : "Out of stock"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateSizeQuantity(sizeName, -1)}
                      disabled={quantity === 0}
                      className="grid h-10 w-10 place-items-center bg-[var(--shirt-blank)] text-lede font-bold text-[var(--gorilla-green)] transition hover:bg-[var(--surface-ok)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={quantity}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) =>
                        onSetSizeQuantity(sizeName, Number(event.target.value))
                      }
                      aria-label={`${sizeName} quantity`}
                      className="h-10 w-16 bg-[var(--shirt-blank)] px-2 text-center text-lg font-bold text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--gorilla-green)]"
                    />

                    <button
                      type="button"
                      onClick={() => onUpdateSizeQuantity(sizeName, 1)}
                      disabled={!canAdd}
                      className="grid h-10 w-10 place-items-center bg-[var(--gorilla-green)] text-lede font-bold text-white transition hover:bg-[var(--gorilla-green-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Current Breakdown
          </p>

          <p className="mt-2 text-sm font-bold text-[var(--ink-black)]">
            {sizeBreakdownFromButtons || "No sizes selected yet"}
          </p>

          {fieldErrors?.sizeBreakdown && (
            <p className="mt-2 text-fine font-bold text-[var(--rush-red)]">
              {fieldErrors.sizeBreakdown}
            </p>
          )}

          {!sizeBreakdownMatchesQuantity && (
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--rush-red)]">
              Add or remove sizes until the total equals{" "}
              {apparelQuote.quantity}.
            </p>
          )}

          {sizeBreakdownMatchesQuantity && sizeQuantityTotal > 0 && (
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--gorilla-green)]">
              Size breakdown total matches the quantity.
            </p>
          )}

          {sizeQuantityTotal > 0 && (
            <button
              type="button"
              onClick={onResetSizeBreakdown}
              className="mt-3 bg-[var(--shirt-blank)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] transition hover:bg-[var(--shirt-blank)]"
            >
              Reset Sizes
            </button>
          )}
        </div>
      </div>
    </>
  );
}
