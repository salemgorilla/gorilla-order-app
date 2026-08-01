"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import {
  BANNER_ADD_ONS,
  CUSTOM_SIZE,
  getSignProduct,
  getSizeOptions,
  signsCatalog,
  type SignsQuote,
} from "../../lib/signs";
import { DECAL_SHIPPING_PRICE } from "../../lib/pricing";
import type { DeliveryMethod } from "../../types/order";

type Props = {
  signsQuote: SignsQuote;
  deliveryMethod: DeliveryMethod;
  onUpdate: (updates: Partial<SignsQuote>) => void;
  onSelectProduct: (productId: string) => void;
  onSelectDeliveryMethod: (deliveryMethod: DeliveryMethod) => void;
};

export default function SignsBuilder({
  signsQuote,
  deliveryMethod,
  onUpdate,
  onSelectProduct,
  onSelectDeliveryMethod,
}: Props) {
  const product = getSignProduct(signsQuote.productId);
  const isCustomSize = signsQuote.size === CUSTOM_SIZE;
  const sizeOptions = getSizeOptions(product);

  return (
    <>
      <div>
        <div className="mb-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
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
                  <p className="font-black text-[var(--ink-black)]">{item.label}</p>
                  {item.pricingMethod === null && (
                    <span className="shrink-0 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">
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

      <QuantitySelector
        quantities={signsCatalog.quantities}
        selected={signsQuote.quantity}
        onSelect={(quantity) => onUpdate({ quantity })}
      />

      <div>
        <OptionSelector
          title="Size"
          options={sizeOptions}
          selected={signsQuote.size}
          onSelect={(size) => onUpdate({ size })}
        />

        {isCustomSize && (
          <div className="mt-3 border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
            <p className="text-sm font-black text-[var(--ink-black)]">
              Enter your size (inches)
            </p>

            <div className="mt-3 flex items-center gap-3">
              <label className="flex-1">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Width
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={signsQuote.customWidthInches || ""}
                  onChange={(event) =>
                    onUpdate({ customWidthInches: Number(event.target.value) })
                  }
                  placeholder="60"
                  className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2 font-black text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--gorilla-green)]"
                />
              </label>

              <span className="mt-5 font-black text-[var(--ink-muted)]">×</span>

              <label className="flex-1">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Height
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={signsQuote.customHeightInches || ""}
                  onChange={(event) =>
                    onUpdate({ customHeightInches: Number(event.target.value) })
                  }
                  placeholder="36"
                  className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2 font-black text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--gorilla-green)]"
                />
              </label>
            </div>

            <p className="mt-3 text-xs font-bold leading-5 text-[var(--ink-muted)]">
              {product.pricingMethod === "banner" ||
              product.pricingMethod === "poster"
                ? "Any size — no extra charge, these print on roll material."
                : "Custom sizes on hard stock add a $20 fee, since odd sizes leave drop pieces when cut from our 48″ × 96″ sheets."}
            </p>
          </div>
        )}
      </div>

      <OptionSelector
        title="Material"
        options={product.materials}
        selected={signsQuote.material}
        onSelect={(material) => onUpdate({ material })}
      />

      <OptionSelector
        title="Finishing"
        options={product.finishing}
        selected={signsQuote.finishing}
        onSelect={(finishing) => onUpdate({ finishing })}
      />

      {product.pricingMethod === "banner" && (
        <div>
          <div className="mb-3">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
              Banner Add-Ons
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              Hems and grommets are already included. These are extras.
            </p>
          </div>

          <div className="space-y-3">
            {BANNER_ADD_ONS.map((addOn) => {
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
                    <span className="block text-sm font-black text-[var(--ink-black)]">
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

      {product.allowDoubleSided && (
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
              <span className="block text-sm font-black text-[var(--ink-black)]">
                Print both sides
              </span>
              <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
                {product.pricingMethod === "yard"
                  ? "Double-sided pricing is built into the quantity price."
                  : "Adds $7 per square foot."}
              </span>
            </span>
          </label>
        </div>
      )}

      <div>
        <div className="mb-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
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
                  <p className="font-black text-[var(--ink-black)]">{option.label}</p>
                  <span
                    className={` px-3 py-1 text-xs font-black ${
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
