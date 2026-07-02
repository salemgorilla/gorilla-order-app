import { StickerOrder } from "../lib/order";

type Props = {
  order: StickerOrder;
};

export default function PriceCard({ order }: Props) {
  return (
    <div className="rounded-3xl bg-black p-8 text-white">
      <p className="text-sm uppercase tracking-widest text-gray-400">
        Estimated Total
      </p>

      <div className="mt-3 text-6xl font-black">
        ${order.total}
      </div>

      <div className="mt-6 space-y-2 text-gray-300">
        <div className="flex justify-between">
          <span>Product</span>
          <span>{order.product}</span>
        </div>

        <div className="flex justify-between">
          <span>Quantity</span>
          <span>{order.quantity}</span>
        </div>

        <div className="flex justify-between">
          <span>Material</span>
          <span>{order.material}</span>
        </div>

        <div className="flex justify-between">
          <span>Shipping</span>
          <span>${order.shippingPrice}</span>
        </div>
      </div>
    </div>
  );
}