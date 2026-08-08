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
  CUSTOM_SIZE,
  getDoubleSidedMethod,
  getFinishingOptions,
  getSignProduct,
  getSizeOptions,
  signsCatalog,
  type SignsQuote,
} from "../../lib/signs";
import { DECAL_SHIPPING_PRICE } from "../../lib/pricing";
import type { FieldErrors } from "../../lib/validation";
import type { DeliveryMethod } from "../../types/order";

type Props = {
  signsQuote: SignsQuote;
  deliveryMethod: DeliveryMethod;
  /** Only populated after a failed submit; empty until then. */
  fieldErrors?: FieldErrors;
  onUpdate: (updates: Partial<SignsQuote>) => void;
  onSelectProduct: (productId: string) => void;
  onSelectDeliveryMethod: (deliveryMethod: DeliveryMethod) => void;
};

export default function SignsBuilder({
  signsQuote,
  deliveryMethod,
  fieldErrors,
  onUpdate,
  onSelectProduct,
  onSelectDeliveryMethod,
}: Props) {
  const product = getSignProduct(signsQuote.productId);
  const isCustomSize = signsQuote.size === CUSTOM_SIZE;
  // Yard signs price from a per-unit table keyed on size, so they are frozen.
  const isYardSign = product.pricingMethod === "yard";
  const sizeOptions = getSizeOptions(product);

  return (
    <>
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
          {signsCatalog.products.map((item) => {
            const isSelected = item.id === signsQuote.productId;

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
                value={signsQuote.customWidthInches}
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
                value={signsQuote.customHeightInches}
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
            value={signsQuote.quantity}
            min={1}
            step={1}
            className="col-span-2 sm:col-span-1"
            snap={snapQuantity}
            onChange={(quantity) => onUpdate({ quantity })}
          />
        </div>

        {!isYardSign &&
          signsQuote.customWidthInches > 0 &&
          signsQuote.customHeightInches > 0 && (
            <p className="mt-3 text-fine leading-5 text-[var(--ink-muted)]">
              {(
                (signsQuote.customWidthInches * signsQuote.customHeightInches) /
                144
              ).toFixed(2)}{" "}
              sq ft each.{" "}
              {product.pricingMethod === "banner" ||
              product.pricingMethod === "poster"
                ? "Any size — no extra charge, these print on roll material."
                : `Hard stock adds a ${priceCopy(
                    signsPricingConfig.customSizeFee
                  )} fee, since odd sizes leave drop pieces when cut from our ${
                    signsPricingConfig.sheetStockInches.width
                  }″ × ${signsPricingConfig.sheetStockInches.height}″ sheets.`}
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
          selected={signsQuote.material}
          onSelect={(material) => onUpdate({ material })}
        />
      )}

      <OptionSelector
        title="Finishing"
        options={getFinishingOptions(product, signsQuote.material)}
        selected={signsQuote.finishing}
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
              signsQuote.material,
              signsQuote.doubleSided
            ).map((addOn) => {
              const checked = signsQuote.bannerAddOns.includes(addOn.key);
              // Pole pockets replace grommets on an edge, so the shop treats
              // them as an alternative to the included grommet finishing.
              const conflicts =
                addOn.key === "polePockets" &&
                signsQuote.finishing === "Hemmed + Grommets";

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
                        ? [...signsQuote.bannerAddOns, addOn.key]
                        : signsQuote.bannerAddOns.filter(
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

      {allowsDoubleSided(product, signsQuote.material) && (
        <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={signsQuote.doubleSided}
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
                  : getDoubleSidedMethod(product, signsQuote.material) === "sewn"
                  ? // 13 oz shows through, so this is genuinely two banners.
                    // Say so before the price moves, not after.
                    `13 oz shows through, so this is two banners sewn back to back — double the material, plus ${priceCopy(
                      signsPricingConfig.banner.doubleSided[
                        signsQuote.material
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

      <div>
        <div className="mb-3">
          <p className="eyebrow">
            Delivery
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
            Pick it up free in Salem, or we can ship it to you.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              {
                value: "Pickup" as const,
                label: "Local Pickup",
                detail: "Pick up in Salem, MA",
                price: "Free",
              },
              {
                value: "Ship" as const,
                label: "Ship It",
                detail: "Shipping quoted with your order",
                price: `from $${DECAL_SHIPPING_PRICE}`,
              },
            ] satisfies {
              value: DeliveryMethod;
              label: string;
              detail: string;
              price: string;
            }[]
          ).map((option) => {
            const isSelected = deliveryMethod === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelectDeliveryMethod(option.value)}
                className={` border p-4 text-left transition ${
                  isSelected
                    ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                    : "border-[var(--rule)] bg-[var(--shirt-blank)] hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-[var(--ink-black)]">{option.label}</p>
                  <span
                    className={` px-3 py-1 text-xs font-bold ${
                      isSelected
                        ? "bg-[var(--gorilla-green)] text-white"
                        : "bg-white text-[var(--gorilla-green)]"
                    }`}
                  >
                    {option.price}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-[var(--ink-muted)]">
                  {option.detail}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
