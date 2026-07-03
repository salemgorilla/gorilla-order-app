"use client";

import { useState } from "react";

import Header from "../components/Header";
import QuantitySelector from "../components/QuantitySelector";
import OptionSelector from "../components/OptionSelector";
import UploadBox from "../components/UploadBox";
import NeedByDate from "../components/NeedByDate";
import CustomerForm from "../components/CustomerForm";
import SubmitButton from "../components/SubmitButton";
import OrderSummary from "../components/summary/OrderSummary";
import OrderValidation from "../components/summary/OrderValidation";

import { stickerCatalog } from "../lib/catalog";
import { defaultOrder } from "../lib/order";
import { getStickerPrice } from "../lib/pricing";
import { getOrderValidationErrors, isOrderReady } from "../lib/validation";

export default function Home() {
  const [order, setOrder] = useState(defaultOrder);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);

  function recalculateOrder(nextOrder: typeof order) {
    const stickerPrice = getStickerPrice(
      nextOrder.product.quantity,
      nextOrder.product.material,
      nextOrder.product.finish
    );

    return {
      ...nextOrder,
      pricing: {
        ...nextOrder.pricing,
        stickerPrice,
        total: stickerPrice,
      },
    };
  }

  function updateProduct(updates: Partial<typeof order.product>) {
    const nextOrder = recalculateOrder({
      ...order,
      product: {
        ...order.product,
        ...updates,
      },
    });

    setOrder(nextOrder);
  }

  function updateCustomer(updates: Partial<typeof order.customer>) {
    setOrder({
      ...order,
      customer: {
        ...order.customer,
        ...updates,
      },
    });
  }

  function updateProduction(updates: Partial<typeof order.production>) {
    setOrder({
      ...order,
      production: {
        ...order.production,
        ...updates,
      },
    });
  }

  function handleArtworkUpload(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setArtworkPreview(previewUrl);

    setOrder({
      ...order,
      artwork: {
        file,
      },
    });
  }

  async function submitOrder() {
    const errors = getOrderValidationErrors(order);

    if (errors.length > 0) {
      alert("Please complete the missing information before requesting a quote.");
      return;
    }

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(order),
      });

      if (!response.ok) {
        throw new Error("Server returned an error.");
      }

      const result = await response.json();

      console.log("QUOTE RESPONSE");
      console.log(result);

      alert("✅ Quote request submitted successfully!");
    } catch (error) {
      console.error(error);
      alert("❌ Unable to submit your quote.\nPlease try again.");
    }
  }

  const unitPrice = order.pricing.total / order.product.quantity;
  const readyToSubmit = isOrderReady(order);

  return (
    <main className="min-h-screen bg-[#F8F5EE]">
      <Header />

      <div className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-10">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#b7352d]">
            Custom Sticker Builder
          </p>

          <h1 className="mt-3 max-w-4xl text-6xl font-black tracking-[-0.08em] text-[#171717]">
            Build, preview, and price your stickers instantly.
          </h1>

          <p className="mt-5 max-w-2xl text-xl leading-8 text-[#6f695e]">
            Configure your order, upload artwork, and get a live estimate before
            sending it to Gorilla Salem.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-8">
          <section className="col-span-7 rounded-[2rem] border border-[#dfd0b8] bg-white p-8 shadow-xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                  Step 1
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">
                  Configure Your Sticker
                </h2>
              </div>

              <div className="rounded-full bg-[#F8F5EE] px-4 py-2 text-sm font-bold text-[#6f695e]">
                Live Pricing
              </div>
            </div>

            <div className="space-y-8">
              <QuantitySelector
                quantities={stickerCatalog.quantities}
                selected={order.product.quantity}
                onSelect={(quantity) => updateProduct({ quantity })}
              />

              <OptionSelector
                title="Size"
                options={stickerCatalog.sizes}
                selected={order.product.size}
                onSelect={(size) => updateProduct({ size })}
              />

              <OptionSelector
                title="Material"
                options={stickerCatalog.materials}
                selected={order.product.material}
                onSelect={(material) => updateProduct({ material })}
              />

              <OptionSelector
                title="Finish"
                options={stickerCatalog.finishes}
                selected={order.product.finish}
                onSelect={(finish) => updateProduct({ finish })}
              />

              <UploadBox onFileSelected={handleArtworkUpload} />

              <NeedByDate
                needBy={order.production.needBy}
                deadlineType={order.production.deadlineType}
                onNeedByChange={(needBy) => updateProduction({ needBy })}
                onDeadlineTypeChange={(deadlineType) =>
                  updateProduction({
                    deadlineType: deadlineType as "Firm" | "Flexible",
                  })
                }
              />

              <CustomerForm
                customerName={order.customer.customerName}
                company={order.customer.company}
                email={order.customer.email}
                phone={order.customer.phone}
                notes={order.customer.notes}
                onChange={(updates) => updateCustomer(updates)}
              />
            </div>
          </section>

          <aside className="col-span-5 space-y-6">
            <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                    Digital Proof
                  </p>

                  <h3 className="mt-2 text-3xl font-black tracking-[-0.05em]">
                    Live Preview
                  </h3>
                </div>

                <div className="rounded-full bg-[#2E5037] px-4 py-2 text-sm font-bold text-white">
                  {order.product.material}
                </div>
              </div>

              <div className="mt-8 grid h-96 place-items-center rounded-[2rem] bg-gradient-to-br from-white to-[#f1e5cf] p-10">
                <div className="grid h-64 w-64 place-items-center rounded-[2rem] bg-white p-6 shadow-2xl ring-8 ring-white">
                  {artworkPreview ? (
                    <img
                      src={artworkPreview}
                      alt="Uploaded artwork preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center rounded-3xl bg-[#2E5037] text-6xl font-black text-white">
                      GS
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-[#F8F5EE] p-4">
                  <p className="text-xs font-bold uppercase text-[#6f695e]">
                    Size
                  </p>
                  <p className="mt-1 font-black">{order.product.size}</p>
                </div>

                <div className="rounded-2xl bg-[#F8F5EE] p-4">
                  <p className="text-xs font-bold uppercase text-[#6f695e]">
                    Finish
                  </p>
                  <p className="mt-1 font-black">{order.product.finish}</p>
                </div>

                <div className="rounded-2xl bg-[#F8F5EE] p-4">
                  <p className="text-xs font-bold uppercase text-[#6f695e]">
                    Each
                  </p>
                  <p className="mt-1 font-black">${unitPrice.toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-[#F8F5EE] p-4 text-center">
                <p className="text-xs font-bold uppercase text-[#6f695e]">
                  Needed In Hand
                </p>

                <p className="mt-1 font-black">
                  {order.production.needBy || "Not entered yet"}
                </p>

                <p className="mt-1 text-sm font-bold text-[#6f695e]">
                  {order.production.deadlineType} deadline
                </p>
              </div>
            </div>

            <OrderSummary order={order} />

            <OrderValidation order={order} />

            <div className="mt-6">
              {readyToSubmit ? (
                <SubmitButton onSubmit={submitOrder} />
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-2xl bg-gray-300 py-5 text-xl font-black text-gray-500"
                >
                  Complete Required Info
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}