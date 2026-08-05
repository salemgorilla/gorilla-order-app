"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import { CUSTOM_STICKER_SIZE, stickerCatalog } from "../../lib/catalog";
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
        options={[...stickerCatalog.sizes, CUSTOM_STICKER_SIZE]}
        selected={product.size}
        onSelect={(size) =>
          // Picking a preset clears any dimensions, so the two can never
          // disagree about what is being priced.
          onUpdate(
            size === CUSTOM_STICKER_SIZE
              ? { size }
              : { size, widthInches: 0, heightInches: 0 }
          )
        }
      />

      {product.size === CUSTOM_STICKER_SIZE && (
        <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
          <p className="text-sm font-bold text-[var(--ink-black)]">
            Your size, in inches
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sticker-width"
                className="block text-fine font-bold text-[var(--ink-black)]"
              >
                Width
              </label>
              <input
                id="sticker-width"
                type="number"
                inputMode="decimal"
                min={0.25}
                step={0.25}
                value={product.widthInches || ""}
                onChange={(event) =>
                  onUpdate({ widthInches: Number(event.target.value) || 0 })
                }
                className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-lede transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
              />
            </div>

            <div>
              <label
                htmlFor="sticker-height"
                className="block text-fine font-bold text-[var(--ink-black)]"
              >
                Height
              </label>
              <input
                id="sticker-height"
                type="number"
                inputMode="decimal"
                min={0.25}
                step={0.25}
                value={product.heightInches || ""}
                onChange={(event) =>
                  onUpdate({ heightInches: Number(event.target.value) || 0 })
                }
                className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-lede transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
              />
            </div>
          </div>

          <p className="mt-3 text-fine leading-5 text-[var(--ink-muted)]">
            {product.widthInches > 0 && product.heightInches > 0
              ? `${(product.widthInches * product.heightInches).toFixed(
                  2
                )} sq in each. Priced on area, so any size works — no rounding to a preset.`
              : "Enter both and the price updates. Any size works — you're charged on area."}
          </p>
        </div>
      )}

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

      <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={product.magentaCutLine}
            onChange={(event) =>
              onUpdate({ magentaCutLine: event.target.checked })
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--cut-line)]"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-bold text-[var(--ink-black)]">
              <span
                className="inline-block h-3 w-3"
                // The legend swatch must be the exact colour the copy below
                // names, or colour-picking it produces an undetectable line.
                style={{ backgroundColor: "var(--cut-line)" }}
              />
              My artwork includes a magenta cut line
            </span>
            <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
              Check this if your file has a{" "}
              <span className="font-bold text-[var(--cut-line)]">100% magenta</span>{" "}
              (RGB 255, 0, 255) line marking exactly where you want it cut —
              perfect for custom die-cut shapes.
            </span>
          </span>
        </label>

        {hasArtwork && magentaDetected && (
          <p className="mt-3 bg-[var(--surface-ok)] p-3 text-xs font-bold leading-5 text-[var(--gorilla-green)]">
            ✓ We spotted a magenta cut line in your file and checked the box for
            you.
          </p>
        )}

        {hasArtwork && product.magentaCutLine && !magentaDetected && (
          <p className="mt-3 bg-[var(--surface-warn)] p-3 text-xs font-bold leading-5 text-[var(--ink-warn)]">
            We couldn&apos;t spot a magenta line in your file. Make sure it&apos;s
            a <span className="font-bold text-[var(--cut-line)]">100% magenta</span> (255,
            0, 255) stroke — otherwise Gorilla Salem will confirm the cut with
            you.
          </p>
        )}

        {product.magentaCutLine && (
          <p className="mt-3 bg-white p-3 text-xs font-bold leading-5 text-[var(--ink-muted)]">
            Put the magenta line on its own layer as a thin stroke (no fill). It
            marks the cut only —{" "}
            <span className="font-bold">it won&apos;t be printed</span>. Vector
            files (AI, PDF, EPS, SVG) cut cleanest; on a PNG it still shows us
            where to cut. If it&apos;s missing or unclear, Gorilla Salem will
            confirm before printing.
          </p>
        )}
      </div>

      <div>
        <div className="mb-3">
          <p className="eyebrow">
            Delivery
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
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
