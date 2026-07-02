"use client";

import { useState } from "react";

import Header from "../components/Header";
import PriceCard from "../components/PriceCard";
import QuantitySelector from "../components/QuantitySelector";
import OptionSelector from "../components/OptionSelector";

import { stickerCatalog } from "../lib/catalog";
import { defaultOrder } from "../lib/order";
import { getStickerPrice } from "../lib/pricing";

export default function Home() {
  const [order, setOrder] = useState(defaultOrder);

  function updateOrder(updates: Partial<typeof order>) {
    const nextOrder = {
      ...order,
      ...updates,
    };

    const total = getStickerPrice(
      nextOrder.quantity,
      nextOrder.material,
      nextOrder.finish
    );

    setOrder({
      ...nextOrder,
      stickerPrice: total,
      total,
    });
  }

  return (
    <main className="min-h-screen bg-[#F8F5EE]">
      <Header />

      <div className="mx-auto max-w-7xl px-8 py-10">
        <div className="grid grid-cols-12 gap-8">
          <section className="col-span-7 rounded-3xl bg-white p-8 shadow-lg">
            <h2 className="text-3xl font-bold">Build Your Sticker Order</h2>

            <p className="mt-2 text-gray-600">
              Configure your stickers, upload artwork and receive an instant quote.
            </p>

            <div className="mt-8">
              <QuantitySelector
                quantities={stickerCatalog.quantities}
                selected={order.quantity}
                onSelect={(quantity) => updateOrder({ quantity })}
              />
            </div>

            <div className="mt-8">
              <OptionSelector
                title="Size"
                options={stickerCatalog.sizes}
                selected={order.size}
                onSelect={(size) => updateOrder({ size })}
              />
            </div>

            <div className="mt-8">
              <OptionSelector
                title="Material"
                options={stickerCatalog.materials}
                selected={order.material}
                onSelect={(material) => updateOrder({ material })}
              />
            </div>

            <div className="mt-8">
              <OptionSelector
                title="Finish"
                options={stickerCatalog.finishes}
                selected={order.finish}
                onSelect={(finish) => updateOrder({ finish })}
              />
            </div>
          </section>

          <aside className="col-span-5 space-y-6">
            <div className="rounded-3xl bg-white p-8 shadow-lg">
              <h3 className="text-2xl font-bold">Live Preview</h3>

              <div className="mt-6 grid h-72 place-items-center rounded-3xl bg-[#2E5037]">
                <div className="text-6xl font-black text-white">GS</div>
              </div>
            </div>

            <PriceCard order={order} />
          </aside>
        </div>
      </div>
    </main>
  );
}