"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import { stickerCatalog } from "../../lib/catalog";
import { DECAL_SHIPPING_PRICE } from "../../lib/pricing";
import type { DeliveryMethod, Product } from "../../types/order";

type Props = {
  product: Product;
  deliveryMethod: DeliveryMethod;
  hasArtwork: boolean;
  magentaDetected: boolean;
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
  hasArtwork,
  magentaDetected,
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
        title="Sticker Type"
        options={stickerCatalog.materials}
        selected={product.material}
        onSelect={(material) => onSelectMaterial(material)}
      />

      <div className="rounded-2xl border border-[#dfd0b8] bg-[#F8F5EE] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={product.magentaCutLine}
            onChange={(event) =>
              onUpdate({ magentaCutLine: event.target.checked })
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[#e6007e]"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-black text-[#171717]">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: "#e6007e" }}
              />
              My artwork includes a magenta cut line
            </span>
            <span className="mt-1 block text-sm font-bold leading-5 text-[#6f695e]">
              Check this if your file has a{" "}
              <span className="font-black text-[#e6007e]">100% magenta</span>{" "}
              (RGB 255, 0, 255) line marking exactly where you want it cut —
              perfect for custom die-cut shapes.
            </span>
          </span>
        </label>

        {hasArtwork && magentaDetected && (
          <p className="mt-3 rounded-xl bg-[#eef7ee] p-3 text-xs font-black leading-5 text-[#2E5037]">
            ✓ We spotted a magenta cut line in your file and checked the box for
            you.
          </p>
        )}

        {hasArtwork && product.magentaCutLine && !magentaDetected && (
          <p className="mt-3 rounded-xl bg-[#fff7e8] p-3 text-xs font-bold leading-5 text-[#8a6d1b]">
            We couldn&apos;t spot a magenta line in your file. Make sure it&apos;s
            a <span className="font-black text-[#e6007e]">100% magenta</span> (255,
            0, 255) stroke — otherwise Gorilla Salem will confirm the cut with
            you.
          </p>
        )}

        {product.magentaCutLine && (
          <p className="mt-3 rounded-xl bg-white p-3 text-xs font-bold leading-5 text-[#6f695e]">
            Put the magenta line on its own layer as a thin stroke (no fill). It
            marks the cut only —{" "}
            <span className="font-black">it won&apos;t be printed</span>. Vector
            files (AI, PDF, EPS, SVG) cut cleanest; on a PNG it still shows us
            where to cut. If it&apos;s missing or unclear, Gorilla Salem will
            confirm before printing.
          </p>
        )}
      </div>

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
