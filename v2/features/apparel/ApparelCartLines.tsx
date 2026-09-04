"use client";

import NumberField from "../../components/ui/NumberField";
import { describeAssumedMix } from "../../lib/apparel-blend";
import {
  findExtraLineColor,
  findExtraLineProduct,
  type ExtraGarmentLine,
} from "../../lib/apparel-cart-lines";
import { blendedGarmentUnitPrice } from "../../lib/apparel-blend";
import type { FieldErrors } from "../../lib/validation";
import type { SsCatalogProduct } from "../types";

type Props = {
  lines: ExtraGarmentLine[];
  products: SsCatalogProduct[];
  /** Per-line problems, keyed by line id — extraGarmentLineErrors(). */
  lineErrors: Record<string, string>;
  fieldErrors?: FieldErrors;
  /** "24 × Premium Tee / White" — what the extras are in addition to. */
  primaryDescription: string;
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<ExtraGarmentLine>) => void;
  onRemove: (id: string) => void;
};

/**
 * Order Desk — the "and also" under the apparel configurator.
 *
 * The configurator above configures ONE garment in full. A team order is
 * rarely one garment — Stacey Beer submitted three separate quotes trying
 * to get tees and hoodies priced together — so this is where the rest of
 * the order goes: more garments, same print, each a product, a colour and
 * a rough count. lib/apparel-cart.ts prices the lot as one run.
 *
 * Native <select>s, styled to the input register. Chips are the house
 * selection control, but a garment picker is thirty products by sixty
 * colours; a chip wall per line would be most of the page. The select
 * carries the same hairline, radius 0 and inversion-free hover the
 * NumberField beside it does.
 */
export default function ApparelCartLines({
  lines,
  products,
  lineErrors,
  fieldErrors,
  primaryDescription,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const selectClass = (invalid: boolean) =>
    [
      "min-h-[44px] w-full bg-[var(--paper)] px-3 py-2 font-bold text-[var(--ink-black)]",
      "transition-colors duration-[120ms] ease-linear",
      invalid
        ? "border-2 border-[var(--rush-red)]"
        : "border border-[var(--rule)] hover:border-[var(--ink-black)]",
    ].join(" ");

  return (
    <div
      className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5"
      data-invalid={fieldErrors?.garmentLines ? "true" : undefined}
    >
      <div className="mb-4">
        <p className="eyebrow">More garments, same print</p>
        <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
          Adding hoodies or a second color to your {primaryDescription}? Same
          screens, one setup — and the print price is tiered on the whole run.
        </p>
      </div>

      {lines.length > 0 && (
        <div className="space-y-4">
          {lines.map((line, index) => {
            const product = findExtraLineProduct(line, products);
            const color = findExtraLineColor(line, products);
            const error = lineErrors[line.id];
            const unit = color ? blendedGarmentUnitPrice(color) : 0;

            return (
              <section
                key={line.id}
                aria-label={`Added garment ${index + 1}`}
                className="border border-[var(--rule)] bg-[var(--paper)] p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-3">
                  <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
                    Garment {String(index + 2).padStart(2, "0")}
                  </p>

                  {/* Rush red is the removal ink, and never the only
                      signal — the word carries it too. */}
                  <button
                    type="button"
                    onClick={() => onRemove(line.id)}
                    className={[
                      "min-h-[44px] cursor-pointer border border-[var(--rule)] px-4 py-2",
                      "text-fine font-bold text-[var(--rush-red)]",
                      "transition-colors duration-[120ms] ease-linear",
                      "hover:border-[var(--rush-red)] hover:bg-[var(--surface-rush)]",
                      "active:translate-x-[2px] active:translate-y-[2px]",
                    ].join(" ")}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
                  <label className="block">
                    <span className="block text-fine font-bold text-[var(--ink-black)]">
                      Garment
                    </span>
                    <select
                      value={line.productId}
                      onChange={(event) => {
                        const next = products.find(
                          (candidate) => candidate.id === event.target.value
                        );
                        const firstColor =
                          next?.colors.find((c) => c.isAvailable) ||
                          next?.colors[0];

                        onUpdate(line.id, {
                          productId: event.target.value,
                          // A product change resets the colour to that
                          // product's first, never carries "Navy" onto a
                          // garment that has no Navy.
                          colorName: firstColor?.colorName || "",
                        });
                      }}
                      aria-invalid={error && !line.productId ? true : undefined}
                      className={`mt-1 ${selectClass(Boolean(error && !line.productId))}`}
                    >
                      <option value="">Choose a garment…</option>
                      {products.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.customerLabel || candidate.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-fine font-bold text-[var(--ink-black)]">
                      Color
                    </span>
                    <select
                      value={line.colorName}
                      disabled={!product}
                      onChange={(event) =>
                        onUpdate(line.id, { colorName: event.target.value })
                      }
                      aria-invalid={
                        error && line.productId && !color ? true : undefined
                      }
                      className={`mt-1 ${selectClass(
                        Boolean(error && line.productId && !color)
                      )} disabled:cursor-not-allowed disabled:text-[var(--ink-muted)]`}
                    >
                      <option value="">
                        {product ? "Choose a color…" : "Pick a garment first"}
                      </option>
                      {(product?.colors ?? []).map((candidate) => (
                        <option
                          key={candidate.colorName}
                          value={candidate.colorName}
                          disabled={!candidate.isAvailable}
                        >
                          {candidate.colorName}
                          {candidate.outOfStock ? " (out of stock)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <NumberField
                    id={`apparel-line-${line.id}-quantity`}
                    label="How many"
                    value={line.quantity}
                    min={0}
                    step={1}
                    snap={(value) => Math.max(0, Math.round(value))}
                    onChange={(quantity) => onUpdate(line.id, { quantity })}
                    error={error && color && !(line.quantity > 0) ? error : undefined}
                  />
                </div>

                {/* One message per line, in the row: what to do next. The
                    quantity field shows its own when that is the problem. */}
                {error && !(color && !(line.quantity > 0)) && (
                  <p className="mt-2 text-fine font-bold text-[var(--rush-red)]">
                    {error}
                  </p>
                )}

                {color && line.quantity > 0 && (
                  <p className="mt-3 text-fine font-medium text-[var(--ink-muted)]">
                    About{" "}
                    <span className="spec font-bold text-[var(--ink-black)]">
                      ${unit.toFixed(2)}
                    </span>{" "}
                    per garment before printing —{" "}
                    {/* Only the first letter drops case: the sizes in the
                        sentence are "2XL", not "2xl". */}
                    {describeAssumedMix().charAt(0).toLowerCase() +
                      describeAssumedMix().slice(1)}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {fieldErrors?.garmentLines && (
        <p className="mt-3 text-fine font-bold text-[var(--rush-red)]">
          {fieldErrors.garmentLines}
        </p>
      )}

      <button
        type="button"
        onClick={onAdd}
        className={[
          "mt-4 min-h-[44px] w-full cursor-pointer border border-dashed border-[var(--rule)]",
          "bg-[var(--paper)] px-4 py-3 text-fine font-bold text-[var(--ink-black)]",
          "transition-colors duration-[120ms] ease-linear",
          "hover:border-[var(--ink-black)] hover:bg-white",
          "active:translate-x-[2px] active:translate-y-[2px]",
        ].join(" ")}
      >
        + Add another garment
        <span className="ml-2 font-normal text-[var(--ink-muted)]">
          same screens, no extra setup
        </span>
      </button>
    </div>
  );
}
