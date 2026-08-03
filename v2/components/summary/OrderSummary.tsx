interface Props {
  order: any;
}

export default function OrderSummary({ order }: Props) {
  return (
    <div className=" border border-[var(--rule)] bg-white p-8">
      <p className="eyebrow">
        Review
      </p>

      <h2 className="mt-2 text-head font-bold tracking-display">
        Order Summary
      </h2>

      <div className="mt-8 space-y-4">

        <SummaryRow label="Product" value={order.product.type} />

        <SummaryRow
          label="Quantity"
          value={order.product.quantity.toLocaleString()}
        />

        <SummaryRow
          label="Size"
          value={order.product.size}
        />

        <SummaryRow
          label="Material"
          value={order.product.material}
        />

        <SummaryRow
          label="Finish"
          value={order.product.finish}
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
            order.artwork.file
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