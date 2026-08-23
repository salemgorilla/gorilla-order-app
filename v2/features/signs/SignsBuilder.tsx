"use client";

import OptionSelector from "../../components/OptionSelector";
import NumberField from "../../components/ui/NumberField";
import { sanitizeSizeInches, snapQuantity } from "../../lib/units";
import {
  YARD_SIGN_HEIGHT_INCHES,
  YARD_SIGN_WIDTH_INCHES,
} from "../../lib/signs";
import { signsPricingConfig } from "../../lib/signs-pricing-config";

/**
 * Money for prose: "$22", "$7.70". Every price shown in copy is read from
 * signs-pricing-config rather than typed inline, so a rate change can never
 * leave the app quoting one number and telling the customer another.
 */
function priceCopy(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}
import {
  allowsDoubleSided,
  getBannerAddOns,
  getDoubleSidedMethod,
  getFinishingOptions,
  getSignFamilyProducts,
  getSignProduct,
  type SignFamily,
  type SignsDesign,
} from "../../lib/signs";
import type { FieldErrors } from "../../lib/validation";

type Props = {
  design: SignsDesign;
  /**
   * Which large-format pipeline this builder serves. Hard split: the picker
   * lists only this family's products, so a signs quote can never grow a
   * banner design or the other way round.
   */
  family: SignFamily;
  /** Only populated after a failed submit; empty until then. */
  fieldErrors?: FieldErrors;
  onUpdate: (updates: Partial<SignsDesign>) => void;
  onSelectProduct: (productId: string) => void;
};

export default function SignsBuilder({
  design,
  family,
  fieldErrors,
  onUpdate,
  onSelectProduct,
}: Props) {
  const product = getSignProduct(design.productId);
  const familyProducts = getSignFamilyProducts(family);
  // Yard signs price from a per-unit table keyed on size, so they are frozen.
  const isYardSign = product.pricingMethod === "yard";

  return (
    <>
      {/* One product in the family (banners today) means there is nothing to
          pick — a picker with a single pre-selected card reads as a question
          with one answer, so the flow goes straight to size and quantity. */}
      {familyProducts.length > 1 && (
      <div>
        <div className="mb-3">
          <p className="eyebrow">
            Sign Type
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
            Pick what you need and we&apos;ll price it as you build.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {familyProducts.map((item) => {
            const isSelected = item.id === design.productId;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectProduct(item.id)}
                className={` border p-4 text-left transition ${
                  isSelected
                    ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                    : "border-[var(--rule)] bg-[var(--shirt-blank)] hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[var(--ink-black)]">{item.label}</p>
                  {item.pricingMethod === null && (
                    <span className="shrink-0 bg-white px-2 py-1 text-spec font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                      Quote
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-bold leading-5 text-[var(--ink-muted)]">
                  {item.blurb}
                </p>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Quantity and size are typed, not picked from chips.
          YARD SIGNS ARE THE EXCEPTION: their price comes from a per-unit
          quantity table keyed on the size string, so the size is frozen at
          18" x 24" rather than opened up. Free entry there would push every
          yard sign into hand-pricing. */}
      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
        <h3 className="text-lede font-bold">Size and quantity</h3>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {isYardSign
            ? 'Yard signs are made at 18" x 24". Tell us how many.'
            : "Any size. Enter the exact width and height you need."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {isYardSign ? (
            <div className="col-span-2">
              <span className="block text-fine font-bold text-[var(--ink-black)]">
                Size
              </span>
              <p className="spec mt-1 flex min-h-[44px] items-center border border-[var(--rule)] bg-[var(--paper)] p-3 text-lede text-[var(--ink-black)]">
                {YARD_SIGN_WIDTH_INCHES}&quot; &times; {YARD_SIGN_HEIGHT_INCHES}&quot;
              </p>
            </div>
          ) : (
            <>
              <NumberField
                id="sign-width"
                label="Width (in)"
                unit="in"
                value={design.customWidthInches}
                min={0.01}
                // "any" rather than a fixed step: a step of 0.25 made the
                // browser reject 1.1 as invalid, which is now allowed.
                step="any"
                snap={sanitizeSizeInches}
                error={fieldErrors?.width}
                onChange={(customWidthInches) => onUpdate({ customWidthInches })}
              />

              <NumberField
                id="sign-height"
                label="Height (in)"
                unit="in"
                value={design.customHeightInches}
                min={0.01}
                // "any" rather than a fixed step: a step of 0.25 made the
                // browser reject 1.1 as invalid, which is now allowed.
                step="any"
                snap={sanitizeSizeInches}
                error={fieldErrors?.height}
                onChange={(customHeightInches) =>
                  onUpdate({ customHeightInches })
                }
              />
            </>
          )}

          <NumberField
            id="sign-quantity"
            label="How many"
            value={design.quantity}
            min={1}
            step={1}
            className="col-span-2 sm:col-span-1"
            snap={snapQuantity}
            // Without this the quantity rule blocks submit and paints nothing:
            // the customer is moved to Details and left looking for whatever
            // is wrong. data-invalid lives on NumberField's wrapper, so it is
            // also what the scroll-to-first-error effect can find.
            error={fieldErrors?.quantity}
            onChange={(quantity) => onUpdate({ quantity })}
          />
        </div>

        {!isYardSign &&
          design.customWidthInches > 0 &&
          design.customHeightInches > 0 && (
            <p className="mt-3 text-fine leading-5 text-[var(--ink-muted)]">
              {(
                (design.customWidthInches * design.customHeightInches) /
                144
              ).toFixed(2)}{" "}
              sq ft each. Any size — an odd size costs no more than a
              standard one, on every sign type.
            </p>
          )}
      </div>

      {/* A single-material product has nothing to choose. Yard signs are one
          coroplast, so offering a thickness pick asked the customer a question
          with only one answer. Driven off the catalog rather than a yard-sign
          special case, so any future single-material product behaves the same. */}
      {product.materials.length > 1 && (
        <OptionSelector
          title="Material"
          options={product.materials}
          selected={design.material}
          onSelect={(material) => onUpdate({ material })}
        />
      )}

      <OptionSelector
        title="Finishing"
        options={getFinishingOptions(product, design.material)}
        selected={design.finishing}
        onSelect={(finishing) => onUpdate({ finishing })}
      />

      {product.pricingMethod === "banner" && (
        <div>
          <div className="mb-3">
            <p className="eyebrow">
              Banner Add-Ons
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              Hems and grommets are already included. These are extras.
            </p>
          </div>

          <div className="space-y-3">
            {getBannerAddOns(
              design.material,
              design.doubleSided
            ).map((addOn) => {
              const checked = design.bannerAddOns.includes(addOn.key);
              // Pole pockets replace grommets on an edge, so the shop treats
              // them as an alternative to the included grommet finishing.
              const conflicts =
                addOn.key === "polePockets" &&
                design.finishing === "Hemmed + Grommets";

              return (
                <label
                  key={addOn.key}
                  className="flex cursor-pointer items-start gap-3 border border-[var(--rule)] bg-[var(--shirt-blank)] p-4"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...design.bannerAddOns, addOn.key]
                        : design.bannerAddOns.filter(
                            (k) => k !== addOn.key
                          );
                      onUpdate({ bannerAddOns: next });
                    }}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--gorilla-green)]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-[var(--ink-black)]">
                      {addOn.label}
                    </span>
                    <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
                      {addOn.detail}
                    </span>
                    {checked && conflicts && (
                      <span className="mt-2 block text-xs font-bold leading-5 text-[var(--ink-warn)]">
                        Pole pockets and grommets can&apos;t share an edge — we&apos;ll
                        confirm the layout with you.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {allowsDoubleSided(product, design.material) && (
        <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={design.doubleSided}
              onChange={(event) =>
                onUpdate({ doubleSided: event.target.checked })
              }
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--gorilla-green)]"
            />
            <span>
              <span className="block text-sm font-bold text-[var(--ink-black)]">
                Print both sides
              </span>
              <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
                {product.pricingMethod === "yard"
                  ? "Double-sided pricing is built into the quantity price."
                  : getDoubleSidedMethod(product, design.material) === "sewn"
                  ? // 13 oz shows through, so this is genuinely two banners.
                    // Say so before the price moves, not after.
                    `13 oz shows through, so this is two banners sewn back to back — double the material, plus ${priceCopy(
                      signsPricingConfig.banner.doubleSided[
                        design.material
                      ]?.constructionPerLinearFoot ?? 0
                    )} per linear foot to construct.`
                  : `Adds ${priceCopy(
                      signsPricingConfig.doubleSidedPerSqft
                    )} per square foot.`}
              </span>
            </span>
          </label>
        </div>
      )}

    </>
  );
}
