"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import { apparelCatalog, type ApparelQuote } from "../../lib/apparel";
import type { ArtworkAnalysis } from "../../lib/artwork";
import type {
  SsCatalogColor,
  SsCatalogProduct,
  SsCatalogSize,
} from "../types";

type Props = {
  apparelQuote: ApparelQuote;
  artworkAnalysis: ArtworkAnalysis | null;

  ssCatalogStatus: "idle" | "loading" | "loaded" | "error";
  ssCatalogError: string;
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

  onSelectQuantity: (quantity: number) => void;
  onSelectCategory: (category: string) => void;
  onSelectProduct: (product: SsCatalogProduct) => void;
  onSelectColor: (color: SsCatalogColor) => void;
  onSelectSize: (size: SsCatalogSize) => void;
  onSelectGarmentType: (garmentType: string) => void;
  onSelectFallbackGarmentColor: (garmentColor: string) => void;
  onTogglePrintLocation: (location: string) => void;
  onSelectInkColors: (inkColors: string) => void;
  onUpdateSizeQuantity: (sizeName: string, change: number) => void;
  onSetSizeQuantity: (sizeName: string, value: number) => void;
  onResetSizeBreakdown: () => void;
};

export default function ApparelBuilder({
  apparelQuote,
  artworkAnalysis,
  ssCatalogStatus,
  ssCatalogError,
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
  onSelectQuantity,
  onSelectCategory,
  onSelectProduct,
  onSelectColor,
  onSelectSize,
  onSelectGarmentType,
  onSelectFallbackGarmentColor,
  onTogglePrintLocation,
  onSelectInkColors,
  onUpdateSizeQuantity,
  onSetSizeQuantity,
  onResetSizeBreakdown,
}: Props) {
  return (
    <>
      <QuantitySelector
        quantities={apparelCatalog.quantities}
        selected={apparelQuote.quantity}
        onSelect={(quantity) => onSelectQuantity(quantity)}
      />

      <div className="rounded-[2rem] border border-[#dfd0b8] bg-[#F8F5EE] p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
              Live S&S Catalog
            </p>
            <p className="mt-1 text-sm font-bold text-[#6f695e]">
              Products, colors, sizes, pricing, availability, and images
              are pulled from S&S.
            </p>
          </div>

          <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#2E5037]">
            {ssCatalogStatus === "loaded"
              ? "Loaded"
              : ssCatalogStatus === "loading"
              ? "Loading"
              : ssCatalogStatus === "error"
              ? "Error"
              : "Ready"}
          </span>
        </div>

        {ssCatalogStatus === "error" && (
          <div className="mb-4 rounded-2xl bg-white p-4 text-sm font-bold leading-6 text-[#b7352d]">
            {ssCatalogError}
          </div>
        )}

        {hasSsProducts ? (
          <div className="space-y-5">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
                  Garment Style
                </p>

                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8a8172]">
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
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${
                        isSelected
                          ? "bg-[#2E5037] text-white"
                          : "bg-white text-[#2E5037] hover:bg-[#eef7ee]"
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
                      className={`rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-[#2E5037] bg-white shadow-md"
                          : "border-[#dfd0b8] bg-white/70 hover:bg-white"
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dfd0b8] bg-[#F8F5EE]">
                          {thumbnailColor?.frontImage ? (
                            <img
                              src={thumbnailColor.frontImage}
                              alt={`${product.customerLabel || product.displayName} preview`}
                              className="h-full w-full object-contain p-2"
                            />
                          ) : (
                            <span className="px-2 text-center text-xs font-black uppercase tracking-[0.12em] text-[#8a8172]">
                              No Image
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-[#171717]">
                                {product.customerLabel || product.displayName}
                              </p>
                              <p className="mt-1 text-sm font-bold text-[#6f695e]">
                                {product.customerCategory} • Style{" "}
                                {product.catalogStyle}
                              </p>
                              <p className="mt-1 text-xs font-bold text-[#8a8172]">
                                S&S: {product.displayName}
                              </p>
                            </div>

                            <span className="rounded-full bg-[#F8F5EE] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#2E5037]">
                              {product.colors.length} colors
                            </span>
                          </div>

                          {thumbnailColor?.colorName && (
                            <p className="mt-3 text-xs font-bold text-[#8a8172]">
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
                <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
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
                        className={`rounded-2xl border p-3 text-left transition ${
                          isSelected
                            ? "border-[#2E5037] bg-white shadow-md"
                            : "border-[#dfd0b8] bg-white/70 hover:bg-white"
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
                              className="h-7 w-7 rounded-full border border-black/10 object-cover"
                            />
                          ) : (
                            <span
                              className="h-7 w-7 rounded-full border border-black/10"
                              style={{
                                backgroundColor:
                                  color.colorHex || "#ffffff",
                              }}
                            />
                          )}

                          <span className="text-sm font-black text-[#171717]">
                            {color.colorName}
                          </span>
                        </div>

                        <p className="mt-2 text-xs font-bold text-[#6f695e]">
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
                <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
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
                        className={`rounded-2xl border p-3 text-center transition ${
                          isSelected
                            ? "border-[#2E5037] bg-white shadow-md"
                            : "border-[#dfd0b8] bg-white/70 hover:bg-white"
                        } ${
                          size.outOfStock
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }`}
                      >
                        <p className="text-sm font-black text-[#171717]">
                          {size.sizeName}
                        </p>
                        <p className="mt-1 text-xs font-bold text-[#6f695e]">
                          ${size.markedUpPrice.toFixed(2)}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs font-bold leading-5 text-[#6f695e]">
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

      <div>
        <div className="mb-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Print Locations
          </p>
          <p className="mt-1 text-sm font-bold text-[#6f695e]">
            Choose all that apply.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {apparelCatalog.printLocations.map((location) => {
            const isSelected = apparelQuote.printLocations.includes(location);

            return (
              <button
                key={location}
                type="button"
                onClick={() => onTogglePrintLocation(location)}
                className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                  isSelected
                    ? "border-[#2E5037] bg-[#2E5037] text-white"
                    : "border-[#dfd0b8] bg-[#F8F5EE] text-[#171717] hover:bg-white"
                }`}
              >
                {location}
              </button>
            );
          })}
        </div>
      </div>

      <OptionSelector
        title="Ink Colors"
        options={apparelCatalog.inkColors}
        selected={apparelQuote.inkColors}
        onSelect={(inkColors) => onSelectInkColors(inkColors)}
      />

      {artworkAnalysis?.estimatedColorCount && (
        <div className="rounded-2xl border border-[#dfd0b8] bg-[#F8F5EE] p-4">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Auto Color Count
          </p>

          <div className="mt-3 grid gap-3 text-sm font-bold text-[#6f695e] sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3">
              <p className="text-xs uppercase tracking-[0.12em]">
                Artwork
              </p>
              <p className="mt-1 text-lg font-black text-[#171717]">
                {artworkAnalysis.estimatedColorCount} colors
              </p>
            </div>

            <div className="rounded-xl bg-white p-3">
              <p className="text-xs uppercase tracking-[0.12em]">
                Underbase
              </p>
              <p className="mt-1 text-lg font-black text-[#171717]">
                {apparelQuote.garmentColor === "White"
                  ? "+0"
                  : "+1 white"}
              </p>
            </div>

            <div className="rounded-xl bg-white p-3">
              <p className="text-xs uppercase tracking-[0.12em]">
                Suggested
              </p>
              <p className="mt-1 text-lg font-black text-[#171717]">
                {apparelQuote.inkColors}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs font-bold leading-5 text-[#6f695e]">
            This is an estimate. If the shirt color is not white, the
            app adds one extra color for a white underbase.
          </p>
        </div>
      )}

      <div className="rounded-[2rem] border border-[#dfd0b8] bg-[#F8F5EE] p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
              Size Breakdown
            </p>
            <p className="mt-1 text-sm font-bold text-[#6f695e]">
              Use the buttons to make the total match the order quantity.
            </p>
          </div>

          <span
            className={`rounded-full px-4 py-2 text-sm font-black ${
              sizeBreakdownMatchesQuantity
                ? "bg-[#2E5037] text-white"
                : "bg-white text-[#b7352d]"
            }`}
          >
            {sizeQuantityTotal} / {apparelQuote.quantity}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {sizeOptionsForBreakdown.map((sizeName) => {
            const quantity = sizeQuantities[sizeName] || 0;
            const sizeRecord = selectedSsColor?.sizes.find(
              (size) => size.sizeName === sizeName
            );
            const isAvailable = sizeRecord?.isAvailable ?? true;
            const canAdd =
              isAvailable && sizeQuantityTotal < apparelQuote.quantity;

            return (
              <div
                key={sizeName}
                className={`rounded-2xl border bg-white p-4 ${
                  isAvailable
                    ? "border-[#dfd0b8]"
                    : "border-[#dfd0b8] opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-[#171717]">
                      {sizeName}
                    </p>

                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#6f695e]">
                      {isAvailable ? "Available" : "Out of stock"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateSizeQuantity(sizeName, -1)}
                      disabled={quantity === 0}
                      className="grid h-10 w-10 place-items-center rounded-full bg-[#F8F5EE] text-xl font-black text-[#2E5037] transition hover:bg-[#eef7ee] disabled:cursor-not-allowed disabled:opacity-40"
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
                      className="h-10 w-16 rounded-xl bg-[#F8F5EE] px-2 text-center text-lg font-black text-[#171717] outline-none focus:ring-2 focus:ring-[#2E5037]"
                    />

                    <button
                      type="button"
                      onClick={() => onUpdateSizeQuantity(sizeName, 1)}
                      disabled={!canAdd}
                      className="grid h-10 w-10 place-items-center rounded-full bg-[#2E5037] text-xl font-black text-white transition hover:bg-[#24402c] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
            Current Breakdown
          </p>

          <p className="mt-2 text-sm font-black text-[#171717]">
            {sizeBreakdownFromButtons || "No sizes selected yet"}
          </p>

          {!sizeBreakdownMatchesQuantity && (
            <p className="mt-2 text-sm font-bold leading-6 text-[#b7352d]">
              Add or remove sizes until the total equals{" "}
              {apparelQuote.quantity}.
            </p>
          )}

          {sizeBreakdownMatchesQuantity && sizeQuantityTotal > 0 && (
            <p className="mt-2 text-sm font-bold leading-6 text-[#2E5037]">
              Size breakdown total matches the order quantity.
            </p>
          )}

          {sizeQuantityTotal > 0 && (
            <button
              type="button"
              onClick={onResetSizeBreakdown}
              className="mt-3 rounded-full bg-[#F8F5EE] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#6f695e] transition hover:bg-[#efe4d4]"
            >
              Reset Sizes
            </button>
          )}
        </div>
      </div>
    </>
  );
}
