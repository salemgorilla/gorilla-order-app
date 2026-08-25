"use client";

import { clampArtScaleToShape } from "../../components/preview/StickerShape";
import OptionSelector from "../../components/OptionSelector";
import NumberField from "../../components/ui/NumberField";
import { sanitizeSizeInches, snapQuantity } from "../../lib/units";
import { stickerCatalog } from "../../lib/catalog";
import { DECAL_SHIPPING_PRICE } from "../../lib/pricing";
import type { FieldErrors } from "../../lib/validation";
import type { DeliveryMethod, Product } from "../../types/order";

type Props = {
  product: Product;
  deliveryMethod: DeliveryMethod;
  /**
   * Delivery is an ORDER-level choice, not a per-design one. In a cart only
   * the first design shows it — asking "ship or pick up?" once per design is
   * three chances to give conflicting answers about one parcel.
   */
  showDelivery?: boolean;
  hasArtwork: boolean;
  magentaDetected: boolean;
  /**
   * Whether the uploaded file has a see-through background. null when we could
   * not inspect it (PDF, AI, EPS) — which must read as "unknown", never as a
   * warning we cannot stand behind.
   */
  hasTransparentEdges: boolean | null;
  /** Only populated after a failed submit; empty until then. */
  fieldErrors?: FieldErrors;
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
  showDelivery = true,
  hasArtwork,
  magentaDetected,
  hasTransparentEdges,
  fieldErrors,
  onUpdate,
  onSelectMaterial,
  onSelectDeliveryMethod,
}: Props) {
  return (
    <>
            {/* No preset chips for size or quantity. The price is
          (width x height x $0.032) + ($25 / quantity), so every value is
          computed exactly — presets were only ever shortcuts, and they forced
          a customer who wanted 2x6 or 137 to fight the form. */}
      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
        <h3 className="text-lede font-bold">Size and quantity</h3>
        <p className="mt-1 text-fine text-[var(--ink-muted)]">
          Any size, any amount. Enter the exact width and height you need.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField
            id="sticker-width"
            label="Width (in)"
            value={product.widthInches}
            min={0.01}
            // "any" rather than a fixed step: a step of 0.25 made the browser
            // reject 1.1 as invalid, which is exactly what we now allow.
            step="any"
            unit="in"
            snap={sanitizeSizeInches}
            error={fieldErrors?.width}
            onChange={(widthInches) => onUpdate({ widthInches })}
          />

          <NumberField
            id="sticker-height"
            label="Height (in)"
            value={product.heightInches}
            min={0.01}
            // "any" rather than a fixed step: a step of 0.25 made the browser
            // reject 1.1 as invalid, which is exactly what we now allow.
            step="any"
            unit="in"
            snap={sanitizeSizeInches}
            error={fieldErrors?.height}
            onChange={(heightInches) => onUpdate({ heightInches })}
          />

          <NumberField
            id="sticker-quantity"
            label="How many"
            value={product.quantity}
            min={1}
            step={1}
            className="col-span-2 sm:col-span-1"
            snap={snapQuantity}
            error={fieldErrors?.quantity}
            onChange={(quantity) => onUpdate({ quantity })}
          />
        </div>

        <p className="mt-3 text-fine leading-5 text-[var(--ink-muted)]">
          {/* Setup is per DESIGN, and a cart has more than one. Saying "the
              $25 setup is split across the order" on every card was wrong in
              both halves once a second design existed: the order's setup is
              $37.50, and $25 is only the first design's share. */}
          {product.widthInches > 0 && product.heightInches > 0 ? (
            <>
              {(product.widthInches * product.heightInches).toFixed(2)} sq in
              each. Setup for this design is split across its quantity, so the
              more you order the less each one costs.
            </>
          ) : (
            "Enter a width and height to see your price."
          )}
        </p>
      </div>

<OptionSelector
        title="Shape"
        options={stickerCatalog.shapes}
        selected={product.shape}
        onSelect={(shape) =>
          // Re-clamp on the way in. Someone sets a circle to 141%, switches to
          // Square Corners, and is 37 points past THAT shape's cut edge with a
          // slider that cannot even represent the value it is holding — art
          // silently past the blade, and no way to see it.
          onUpdate({
            shape,
            artScale: clampArtScaleToShape(
              shape,
              product.artScale,
              product.artBleed
            ),
          })
        }
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
            <span className="flex items-center gap-2 text-fine font-bold text-[var(--ink-black)]">
              <span
                className="inline-block h-3 w-3"
                // The legend swatch must be the exact colour the copy below
                // names, or colour-picking it produces an undetectable line.
                style={{ backgroundColor: "var(--cut-line)" }}
              />
              My artwork includes a magenta cut line
            </span>
            <span className="mt-1 block text-fine font-bold leading-5 text-[var(--ink-muted)]">
              Check this if your file has a{" "}
              <span className="font-bold text-[var(--cut-line)]">100% magenta</span>{" "}
              (RGB 255, 0, 255) line marking exactly where you want it cut —
              perfect for custom die-cut shapes.
            </span>
          </span>
        </label>

        {/* A die cut follows the edge of the ARTWORK, and that edge comes from
            the file's transparency. A JPEG, or a PNG flattened onto white, has
            no edge to follow — it cuts as a rectangle. Saying so here, next to
            the shape choice, is the only point at which the customer can still
            do something about it. Without it the first sign of trouble is a
            proof that looks nothing like the sticker they pictured, which is
            exactly what happened. */}
        {hasArtwork &&
          product.shape === "Die Cut" &&
          hasTransparentEdges === false && (
            <p className="mt-3 bg-[var(--surface-warn)] p-3 text-spec font-bold leading-5 text-[var(--ink-warn)]">
              Your file has a solid background, so a die cut would follow the
              edge of the image — a rectangle, not the shape of your design.
              Send a PNG with a transparent background for a contour cut, or
              leave it with us and Gorilla Salem will knock the background out
              before printing and send you a proof.
            </p>
          )}

        {hasArtwork && magentaDetected && (
          <p className="mt-3 bg-[var(--surface-ok)] p-3 text-spec font-bold leading-5 text-[var(--gorilla-green)]">
            ✓ We spotted a magenta cut line in your file and checked the box for
            you.
          </p>
        )}

        {hasArtwork && product.magentaCutLine && !magentaDetected && (
          <p className="mt-3 bg-[var(--surface-warn)] p-3 text-spec font-bold leading-5 text-[var(--ink-warn)]">
            We couldn&apos;t spot a magenta line in your file. Make sure it&apos;s
            a <span className="font-bold text-[var(--cut-line)]">100% magenta</span> (255,
            0, 255) stroke — otherwise Gorilla Salem will confirm the cut with
            you.
          </p>
        )}

        {product.magentaCutLine && (
          <p className="mt-3 bg-white p-3 text-spec font-bold leading-5 text-[var(--ink-muted)]">
            Put the magenta line on its own layer as a thin stroke (no fill). It
            marks the cut only —{" "}
            <span className="font-bold">it won&apos;t be printed</span>. Vector
            files (AI, PDF, EPS, SVG) cut cleanest; on a PNG it still shows us
            where to cut. If it&apos;s missing or unclear, Gorilla Salem will
            confirm before printing.
          </p>
        )}
      </div>

      {showDelivery && (
      <div>
        <div className="mb-3">
          <p className="eyebrow">
            Delivery
          </p>
          <p className="mt-1 text-fine font-bold text-[var(--ink-muted)]">
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
      )}
    </>
  );
}

/**
 * One labelled number input. Sentence-case label, mono value, 44px target —
 * the accessibility floor for customer-facing forms in DESIGN-SYSTEM.md.
 */
