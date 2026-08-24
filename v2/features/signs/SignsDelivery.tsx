"use client";

import { DECAL_SHIPPING_PRICE } from "../../lib/pricing";
import type { DeliveryMethod } from "../../types/order";

/**
 * How the whole order arrives.
 *
 * Lifted out of SignsBuilder when signs quotes grew a design list. A quote
 * with three designs in it is still ONE delivery — asking per design would be
 * asking a question that has no separate answer, and would let a customer set
 * two designs to Pickup and one to Ship on an order that ships once.
 */
export default function SignsDelivery({
  deliveryMethod,
  onSelect,
}: {
  deliveryMethod: DeliveryMethod;
  onSelect: (deliveryMethod: DeliveryMethod) => void;
}) {
  return (
    <div>
      <div className="mb-3">
        <p className="eyebrow">
          Delivery
        </p>
        <p className="mt-1 text-fine font-bold text-[var(--ink-muted)]">
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
              detail: "Shipping quoted separately",
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
              onClick={() => onSelect(option.value)}
              className={` border p-4 text-left transition ${
                isSelected
                  ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                  : "border-[var(--rule)] bg-[var(--shirt-blank)] hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-[var(--ink-black)]">{option.label}</p>
                <span
                  className={` px-3 py-1 text-spec font-bold ${
                    isSelected
                      ? "bg-[var(--gorilla-green)] text-white"
                      : "bg-white text-[var(--gorilla-green)]"
                  }`}
                >
                  {option.price}
                </span>
              </div>
              <p className="mt-2 text-fine font-bold text-[var(--ink-muted)]">
                {option.detail}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
