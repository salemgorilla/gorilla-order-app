interface Props {
  order: any;
}

export default function OrderSummary({ order }: Props) {
  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-8 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
        Review
      </p>

      <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">
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

      <div className="my-8 border-t border-[#ece4d5]" />

      <div className="space-y-3">
        <SummaryRow
          label="Decals"
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

      <div className="my-6 border-t border-[#ece4d5]" />

      <div className="flex justify-between text-xl font-black">
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
      <span className="text-[#6f695e]">
        {label}
      </span>

      <span className="font-bold text-right">
        {value}
      </span>
    </div>
  );
}