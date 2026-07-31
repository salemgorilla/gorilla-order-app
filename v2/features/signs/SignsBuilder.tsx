"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import {
  CUSTOM_SIZE,
  getSignProduct,
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

  return (
    <>
      <div>
        <div className="mb-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Sign Type
          </p>
          <p className="mt-1 text-sm font-bold text-[#6f695e]">
            Pick what you need — we&apos;ll price it and get right back to you.
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
                className={`rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-[#2E5037] bg-[#f4f8f1] shadow-md"
                    : "border-[#dfd0b8] bg-[#F8F5EE] hover:bg-white"
                }`}
              >
                <p className="font-black text-[#171717]">{item.label}</p>
                <p className="mt-1 text-sm font-bold leading-5 text-[#6f695e]">
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
          options={product.sizes}
          selected={signsQuote.size}
          onSelect={(size) => onUpdate({ size })}
        />

        {isCustomSize && (
          <div className="mt-3">
            <label className="block">
              <span className="text-sm font-bold text-[#171717]">
                Tell us the size you need
              </span>
              <input
                type="text"
                value={signsQuote.customSize}
                onChange={(event) =>
                  onUpdate({ customSize: event.target.value })
                }
                placeholder={`e.g. 5' x 10'`}
                className="mt-2 w-full rounded-2xl border border-[#dfd0b8] bg-white px-4 py-3 font-bold text-[#171717] outline-none focus:ring-2 focus:ring-[#2E5037]"
              />
            </label>
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

      <div className="rounded-2xl border border-[#dfd0b8] bg-[#F8F5EE] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={signsQuote.doubleSided}
            onChange={(event) => onUpdate({ doubleSided: event.target.checked })}
            className="mt-1 h-5 w-5 shrink-0 accent-[#2E5037]"
          />
          <span>
            <span className="block text-sm font-black text-[#171717]">
              Print both sides
            </span>
            <span className="mt-1 block text-sm font-bold leading-5 text-[#6f695e]">
              Double-sided printing — handy for yard signs and hanging banners.
            </span>
          </span>
        </label>
      </div>

      <div>
        <div className="mb-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Delivery
          </p>
          <p className="mt-1 text-sm font-bold text-[#6f695e]">
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
                className={`rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-[#2E5037] bg-[#f4f8f1] shadow-md"
                    : "border-[#dfd0b8] bg-[#F8F5EE] hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-[#171717]">{option.label}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      isSelected
                        ? "bg-[#2E5037] text-white"
                        : "bg-white text-[#2E5037]"
                    }`}
                  >
                    {option.price}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-[#6f695e]">
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
