import type { Order } from "../../types/order";

interface Props {
  /**
   * Typed. This was `any`, which is why it went on compiling against
   * `order.product` after that field stopped existing — it would have failed
   * at runtime instead, in front of a customer.
   */
  order: Order;
}

export default function OrderSummary({ order }: Props) {
  const designs = order.items.length;
  const totalStickers = order.items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0
  );
  // Several designs rarely share one size, so the row names the cart rather
  // than picking one design's size and presenting it as the order's.
  const sizeLabel =
    designs > 1 ? `${designs} designs` : order.items[0].size;

  return (
    <div className=" border border-[var(--rule)] bg-white p-8">
      <p className="eyebrow">
        Review
      </p>

      <h2 className="mt-2 text-head font-bold tracking-display">
        Order Summary
      </h2>

      <div className="mt-8 space-y-4">

        <SummaryRow label="Product" value={order.items[0].type} />

        <SummaryRow
          label="Quantity"
          value={totalStickers.toLocaleString()}
        />

        <SummaryRow
          label="Size"
          value={sizeLabel}
        />

        <SummaryRow
          label="Material"
          value={order.items[0].material}
        />

        <SummaryRow
          label="Finish"
          value={order.items[0].finish}
        />

        <SummaryRow
          label="Need By"
          value={order.production.needBy || "Not entered"}
        />

        <SummaryRow
          label="Delivery"
          value={
            order.production.deliveryMethod === "Ship"
              ? "Ship"
              : "Local Pickup"
          }
        />

        <SummaryRow
          label="Artwork"
          value={
            order.items.every((item) => item.artwork.file)
              ? "✅ Uploaded"
              : "❌ Not Uploaded"
          }
        />

      </div>

      <div className="my-8 border-t border-[var(--rule)]" />

      <div className="space-y-3">
        <SummaryRow
          label="Stickers"
          value={`$${order.pricing.stickerPrice.toFixed(2)}`}
        />

        <SummaryRow
          label={
            designs > 1
              ? `Setup (${designs} designs)`
              : "Setup"
          }
          value={`$${order.pricing.setupPrice.toFixed(2)}`}
        />

        <SummaryRow
          label="Shipping"
          value={
            order.pricing.shippingPrice > 0
              ? `$${order.pricing.shippingPrice.toFixed(2)}`
              : "Free (pickup)"
          }
        />
      </div>

      <div className="my-6 border-t border-[var(--rule)]" />

      <div className="flex justify-between text-lede font-bold">
        <span>Total</span>
        <span>${order.pricing.total.toFixed(2)}</span>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--ink-muted)]">
        {label}
      </span>

      <span className="font-bold text-right">
        {value}
      </span>
    </div>
  );
}