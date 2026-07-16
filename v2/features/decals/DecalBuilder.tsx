"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import { stickerCatalog } from "../../lib/catalog";
import { DECAL_SHIPPING_PRICE } from "../../lib/pricing";
import type { DeliveryMethod, Product } from "../../types/order";

type Props = {
  product: Product;
  deliveryMethod: DeliveryMethod;
  onUpdate: (updates: Partial<Product>) => void;
  onSelectMaterial: (material: string) => void;
  onSelectDeliveryMethod: (deliveryMethod: DeliveryMethod) => void;
};

const deliveryOptions: {
  value: DeliveryMethod;
  label: string;
  detail: string;
  price: string;
}[] = [
  {
    value: "Pickup",
    label: "Local Pickup",
    detail: "Pick up in Salem, MA",
    price: "Free",
  },
  {
    value: "Ship",
    label: "Ship It",
    detail: "Mailed to your address",
    price: `+$${DECAL_SHIPPING_PRICE}`,
  },
];

export default function DecalBuilder({
  product,
  deliveryMethod,
  onUpdate,
  onSelectMaterial,
  onSelectDeliveryMethod,
}: Props) {
  return (
    <>
      <QuantitySelector
        quantities={stickerCatalog.quantities}
        selected={product.quantity}
        onSelect={(quantity) => onUpdate({ quantity })}
      />

      <OptionSelector
        title="Size"
        options={stickerCatalog.sizes}
        selected={product.size}
        onSelect={(size) => onUpdate({ size })}
      />

      <OptionSelector
        title="Shape"
        options={stickerCatalog.shapes}
        selected={product.shape}
        onSelect={(shape) => onUpdate({ shape })}
      />

      <OptionSelector
        title="Decal Type"
        options={stickerCatalog.materials}
        selected={product.material}
        onSelect={(material) => onSelectMaterial(material)}
      />

      <div>
        <div className="mb-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Delivery
          </p>
          <p className="mt-1 text-sm font-bold text-[#6f695e]">
            Pick them up free in Salem, or we can ship them to you.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {deliveryOptions.map((option) => {
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
