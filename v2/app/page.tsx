"use client";

import { useState } from "react";

import Header from "../components/Header";
import QuantitySelector from "../components/QuantitySelector";
import OptionSelector from "../components/OptionSelector";
import UploadBox from "../components/upload/UploadBox";
import NeedByDate from "../components/NeedByDate";
import CustomerForm from "../components/CustomerForm";
import SubmitButton from "../components/SubmitButton";
import OrderSummary from "../components/summary/OrderSummary";
import OrderValidation from "../components/summary/OrderValidation";
import ArtworkAnalysisCard from "../components/summary/ArtworkAnalysisCard";
import StickerPreview from "../components/preview/StickerPreview";
import ApparelPreview from "../components/preview/ApparelPreview";

import { stickerCatalog } from "../lib/catalog";
import { apparelCatalog, defaultApparelQuote } from "../lib/apparel";
import { productCategories } from "../lib/products";
import { defaultOrder } from "../lib/order";
import { getStickerPrice } from "../lib/pricing";
import { getOrderValidationErrors, isOrderReady } from "../lib/validation";
import { analyzeArtworkFile, ArtworkAnalysis } from "../lib/artwork";

type QuoteConfirmation = {
  quoteNumber: string;
  receivedAt: string;
  message: string;
};

export default function Home() {
  const [selectedProductId, setSelectedProductId] = useState("stickers");
  const [submittedProductId, setSubmittedProductId] = useState("stickers");
  const [order, setOrder] = useState(defaultOrder);
  const [apparelQuote, setApparelQuote] = useState(defaultApparelQuote);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artworkAnalysis, setArtworkAnalysis] =
    useState<ArtworkAnalysis | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quoteSubmitted, setQuoteSubmitted] = useState(false);
  const [quoteConfirmation, setQuoteConfirmation] =
    useState<QuoteConfirmation | null>(null);

  const isApparelSelected = selectedProductId === "apparel";
  const isApparelSubmitted = submittedProductId === "apparel";

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

  function updateApparelQuote(updates: Partial<typeof apparelQuote>) {
    setApparelQuote({
      ...apparelQuote,
      ...updates,
    });
  }

  function getEstimatedInkColorCount(
    analysis: ArtworkAnalysis | null,
    garmentColor: string
  ) {
    if (!analysis?.estimatedColorCount) {
      return null;
    }

    const underbaseCount = garmentColor === "White" ? 0 : 1;

    return analysis.estimatedColorCount + underbaseCount;
  }

  function formatInkColorOption(colorCount: number | null) {
    if (!colorCount) {
      return apparelQuote.inkColors;
    }

    if (colorCount <= 1) {
      return "1 color";
    }

    if (colorCount === 2) {
      return "2 colors";
    }

    if (colorCount === 3) {
      return "3 colors";
    }

    if (colorCount === 4) {
      return "4 colors";
    }

    return "5+ colors / Full color / Not sure";
  }

  function togglePrintLocation(location: string) {
    const alreadySelected = apparelQuote.printLocations.includes(location);

    const nextLocations = alreadySelected
      ? apparelQuote.printLocations.filter((item) => item !== location)
      : [...apparelQuote.printLocations, location];

    updateApparelQuote({
      printLocations: nextLocations,
    });
  }

  async function handleArtworkUpload(file: File) {
    const previewUrl = URL.createObjectURL(file);

    setArtworkPreview(previewUrl);

    const analysis = await analyzeArtworkFile(file);

    setArtworkAnalysis(analysis);

    if (isApparelSelected) {
      const estimatedInkCount = getEstimatedInkColorCount(
        analysis,
        apparelQuote.garmentColor
      );

      setApparelQuote({
        ...apparelQuote,
        inkColors: formatInkColorOption(estimatedInkCount),
      });
    }

    setOrder({
      ...order,
      artwork: {
        file,
      },
    });
  }

  function getApparelValidationErrors() {
    const errors: string[] = [];

    if (!order.customer.customerName.trim()) {
      errors.push("Customer name is required.");
    }

    if (!order.customer.email.trim()) {
      errors.push("Customer email is required.");
    }

    if (!order.artwork.file) {
      errors.push("Artwork upload is required.");
    }

    if (!order.production.needBy.trim()) {
      errors.push("Needed-in-hand date is required.");
    }

    if (apparelQuote.printLocations.length === 0) {
      errors.push("Choose at least one print location.");
    }

    if (!apparelQuote.sizeBreakdown.trim()) {
      errors.push("Enter a size breakdown.");
    }

    return errors;
  }

  function getCurrentValidationErrors() {
    if (isApparelSelected) {
      return getApparelValidationErrors();
    }

    return getOrderValidationErrors(order);
  }

  function buildQuotePayload() {
    if (isApparelSelected) {
      return {
        customer: order.customer,
        product: {
          type: "T-Shirts & Apparel",
          garmentType: apparelQuote.garmentType,
          quantity: apparelQuote.quantity,
          garmentColor: apparelQuote.garmentColor,
          printLocations: apparelQuote.printLocations,
          inkColors: apparelQuote.inkColors,
          sizeBreakdown: apparelQuote.sizeBreakdown,
        },
        artwork: {
          fileName: order.artwork.file?.name || null,
        },
        production: order.production,
        pricing: {
          total: 0,
          quoteRequired: true,
          note: "Manual apparel pricing required.",
        },
      };
    }

    return order;
  }

  async function submitOrder() {
    const errors = getCurrentValidationErrors();

    if (errors.length > 0) {
      alert("Please complete the missing information before requesting a quote.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order: buildQuotePayload(),
          artworkAnalysis,
        }),
      });

      if (!response.ok) {
        throw new Error("Server returned an error.");
      }

      const result = await response.json();

      console.log("QUOTE RESPONSE");
      console.log(result);

      setQuoteConfirmation({
        quoteNumber: result.quoteNumber,
        receivedAt: result.receivedAt,
        message: result.message,
      });

      setSubmittedProductId(selectedProductId);
      setQuoteSubmitted(true);
    } catch (error) {
      console.error(error);
      alert("❌ Unable to submit your quote.\nPlease try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function getQuoteDetailsText() {
    const quoteNumber = quoteConfirmation?.quoteNumber || "Pending";
    const submittedAt = quoteConfirmation?.receivedAt
      ? new Date(quoteConfirmation.receivedAt).toLocaleString()
      : "Just submitted";

    const customerSection = `CUSTOMER
Name: ${order.customer.customerName}
Company: ${order.customer.company || "N/A"}
Email: ${order.customer.email}
Phone: ${order.customer.phone || "N/A"}`;

    const timelineSection = `TIMELINE
Needed In Hand: ${order.production.needBy || "Not entered"}
Deadline Type: ${order.production.deadlineType}`;

    const estimatedInkCount = getEstimatedInkColorCount(
      artworkAnalysis,
      apparelQuote.garmentColor
    );

    const artworkSection = `ARTWORK
File Uploaded: ${order.artwork.file ? order.artwork.file.name : "No file uploaded"}
File Type: ${artworkAnalysis?.fileType || "N/A"}
File Size: ${artworkAnalysis?.fileSize || "N/A"}
Image Dimensions: ${artworkAnalysis?.dimensions || "N/A"}
Estimated Artwork Colors: ${artworkAnalysis?.estimatedColorCount || "N/A"}
Underbase White Added: ${
      isApparelSubmitted && apparelQuote.garmentColor !== "White" ? "Yes (+1)" : "No"
    }
Suggested Ink Count: ${
      isApparelSubmitted && estimatedInkCount
        ? formatInkColorOption(estimatedInkCount)
        : "N/A"
    }`;

    const notesSection = `NOTES
${order.customer.notes || "No customer notes"}`;

    if (isApparelSubmitted) {
      return `GORILLA SALEM APPAREL QUOTE REQUEST

Quote Number: ${quoteNumber}
Submitted: ${submittedAt}

${customerSection}

APPAREL DETAILS
Product: T-Shirts & Apparel
Garment Type: ${apparelQuote.garmentType}
Quantity: ${apparelQuote.quantity.toLocaleString()}
Garment Color: ${apparelQuote.garmentColor}
Print Locations: ${apparelQuote.printLocations.join(", ")}
Ink Colors: ${apparelQuote.inkColors}
Size Breakdown: ${apparelQuote.sizeBreakdown}

${timelineSection}

ESTIMATE
Manual quote required. Gorilla Salem will confirm apparel pricing after reviewing the order details and artwork.

${artworkSection}

${notesSection}

This is an estimate request, not a final invoice. Gorilla Salem will confirm pricing, timeline, and artwork readiness before production starts.`;
    }

    return `GORILLA SALEM STICKER QUOTE REQUEST

Quote Number: ${quoteNumber}
Submitted: ${submittedAt}

${customerSection}

STICKER DETAILS
Product: ${order.product.type}
Quantity: ${order.product.quantity.toLocaleString()}
Size: ${order.product.size}
Shape: ${order.product.shape}
Material: ${order.product.material}
Finish: ${order.product.finish}

${timelineSection}

ESTIMATE
Estimated Total: $${order.pricing.total.toFixed(2)}
Estimated Each: $${unitPrice.toFixed(2)}

${artworkSection}

${notesSection}

This is an estimate, not a final invoice. Gorilla Salem will confirm pricing, timeline, and artwork readiness before production starts.`;
  }

  async function copyQuoteDetails() {
    try {
      await navigator.clipboard.writeText(getQuoteDetailsText());
      alert("Quote details copied.");
    } catch (error) {
      console.error(error);
      alert("Unable to copy quote details. You can still email the quote.");
    }
  }

  function getEmailQuoteLink() {
    const quoteNumber = quoteConfirmation?.quoteNumber || "Gorilla Salem Quote";
    const subject = encodeURIComponent(`Gorilla Salem Quote Request ${quoteNumber}`);
    const body = encodeURIComponent(getQuoteDetailsText());

    return `https://mail.google.com/mail/?view=cm&fs=1&to=quote@gorillasalem.com&su=${subject}&body=${body}`;
  }

  function startNewQuote() {
    if (artworkPreview) {
      URL.revokeObjectURL(artworkPreview);
    }

    setOrder(defaultOrder);
    setApparelQuote(defaultApparelQuote);
    setSelectedProductId("stickers");
    setSubmittedProductId("stickers");
    setArtworkPreview(null);
    setArtworkAnalysis(null);
    setQuoteConfirmation(null);
    setQuoteSubmitted(false);
    setIsSubmitting(false);
  }

  const unitPrice = order.pricing.total / order.product.quantity;
  const currentValidationErrors = getCurrentValidationErrors();
  const readyToSubmit = isApparelSelected
    ? currentValidationErrors.length === 0
    : isOrderReady(order);

  if (quoteSubmitted) {
    return (
      <main className="min-h-screen bg-[#F8F5EE]">
        <Header />

        <div className="mx-auto grid min-h-[80vh] max-w-5xl place-items-center px-4 py-10 sm:px-8 sm:py-16">
          <div className="w-full rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl sm:p-10">
            <div className="text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#2E5037] text-4xl text-white">
                ✓
              </div>

              <p className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-[#b7352d]">
                Quote Received
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-[#171717] sm:text-5xl">
                Your request was sent to Gorilla Salem.
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#6f695e]">
                We received your quote request. Gorilla Salem will review your artwork,
                timeline, and details before production.
              </p>
            </div>

            <div className="mt-8 rounded-[2rem] bg-[#F8F5EE] p-6 text-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6f695e]">
                Quote Number
              </p>

              <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#2E5037] sm:text-4xl">
                {quoteConfirmation?.quoteNumber || "Pending"}
              </p>

              <p className="mt-2 text-sm font-bold text-[#6f695e]">
                Submitted{" "}
                {quoteConfirmation?.receivedAt
                  ? new Date(quoteConfirmation.receivedAt).toLocaleString()
                  : "just now"}
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[#dfd0b8] p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                  Customer
                </p>

                <p className="mt-2 text-lg font-black text-[#171717]">
                  {order.customer.customerName}
                </p>

                <p className="mt-1 text-sm font-bold text-[#6f695e]">
                  {order.customer.email}
                </p>

                {order.customer.company && (
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {order.customer.company}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[#dfd0b8] p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                  {isApparelSubmitted ? "Apparel Details" : "Sticker Details"}
                </p>

                {isApparelSubmitted ? (
                  <>
                    <p className="mt-2 text-lg font-black text-[#171717]">
                      {apparelQuote.quantity.toLocaleString()} {apparelQuote.garmentType}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      {apparelQuote.garmentColor} • {apparelQuote.inkColors}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      {apparelQuote.printLocations.join(", ")}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-lg font-black text-[#171717]">
                      {order.product.quantity.toLocaleString()} stickers
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      {order.product.size} • {order.product.shape}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      {order.product.material} • {order.product.finish}
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-[#dfd0b8] p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                  Estimate
                </p>

                {isApparelSubmitted ? (
                  <>
                    <p className="mt-2 text-3xl font-black text-[#171717]">
                      Manual Quote
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      Pricing confirmed after review
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-black text-[#171717]">
                      ${order.pricing.total.toFixed(2)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      ${unitPrice.toFixed(2)} each
                    </p>
                  </>
                )}

                <p className="mt-1 text-sm font-bold text-[#6f695e]">
                  Needed: {order.production.needBy || "Not entered"}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-[#fff7e8] p-5">
              <p className="text-sm font-bold leading-6 text-[#6f695e]">
                This is an estimate, not a final invoice. Gorilla Salem will
                confirm pricing, timeline, and artwork readiness before
                production starts.
              </p>

              <p className="mt-3 text-sm font-bold leading-6 text-[#6f695e]">
                Use Copy Quote Details as a backup, or click Open Gmail Draft to
                open a pre-filled Gmail compose window addressed to Gorilla Salem.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={copyQuoteDetails}
                className="rounded-2xl border border-[#2E5037] bg-white px-6 py-4 font-black text-[#2E5037] transition hover:bg-[#F8F5EE]"
              >
                Copy Quote Details
              </button>

              <a
                href={getEmailQuoteLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-[#b7352d] px-6 py-4 text-center font-black text-white transition hover:bg-[#982c25]"
              >
                Open Gmail Draft
              </a>

              <button
                type="button"
                onClick={startNewQuote}
                className="rounded-2xl bg-[#2E5037] px-6 py-4 font-black text-white transition hover:bg-[#24402c]"
              >
                Start New Quote
              </button>
            </div>

            <button
              type="button"
              onClick={() => setQuoteSubmitted(false)}
              className="mt-4 w-full rounded-2xl bg-[#F8F5EE] px-8 py-4 font-black text-[#6f695e] transition hover:bg-[#efe4d4]"
            >
              Back to Builder
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F5EE]">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-10">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#b7352d]">
            Printed Locally in Salem, MA
          </p>

          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.08em] text-[#171717] sm:text-5xl lg:text-6xl">
            Custom print quotes made simple.
          </h1>

          <p className="mt-5 max-w-2xl text-xl leading-8 text-[#6f695e]">
            Choose your details, upload your artwork, and get a live estimate or
            quote request before sending it to Gorilla Salem.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#2E5037] shadow-sm">
              Hand-printed locally
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#2E5037] shadow-sm">
              Salem, Massachusetts
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#2E5037] shadow-sm">
              Real proof review before production
            </span>
          </div>
        </div>

        <section className="mb-8 rounded-[2rem] border border-[#dfd0b8] bg-white p-5 shadow-xl sm:p-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                Product Type
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#171717]">
                What do you want to quote?
              </h2>
            </div>

            <p className="max-w-md text-sm font-bold leading-6 text-[#6f695e]">
              Start with stickers or apparel. More Gorilla Salem products can be
              added to this system without rebuilding the whole app.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {productCategories.map((product) => {
              const isActive = product.status === "active";
              const isSelected = selectedProductId === product.id;

              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={!isActive}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    updateProduct({ type: product.title });
                  }}
                  className={`rounded-[1.5rem] border p-5 text-left transition ${
                    isSelected
                      ? "border-[#2E5037] bg-[#f4f8f1] shadow-md"
                      : isActive
                      ? "border-[#dfd0b8] bg-white shadow-sm hover:-translate-y-0.5"
                      : "cursor-not-allowed border-[#dfd0b8] bg-[#F8F5EE] opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-black text-[#171717]">
                      {product.title}
                    </p>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        isSelected
                          ? "bg-[#2E5037] text-white"
                          : "bg-[#F8F5EE] text-[#6f695e]"
                      }`}
                    >
                      {product.badge}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-bold leading-6 text-[#6f695e]">
                    {product.description}
                  </p>

                  <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                    {isActive ? "Available now" : "Coming soon"}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section className="rounded-[2rem] border border-[#dfd0b8] bg-white p-5 shadow-xl sm:p-8 lg:col-span-7">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                  Step 1
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">
                  {isApparelSelected
                    ? "Build Your Apparel Quote"
                    : "Choose Your Sticker Details"}
                </h2>
              </div>

              <div className="rounded-full bg-[#F8F5EE] px-4 py-2 text-sm font-bold text-[#6f695e]">
                {isApparelSelected ? "Manual Quote" : "Instant Estimate"}
              </div>
            </div>

            <div className="space-y-8">
              {isApparelSelected ? (
                <>
                  <QuantitySelector
                    quantities={apparelCatalog.quantities}
                    selected={apparelQuote.quantity}
                    onSelect={(quantity) => updateApparelQuote({ quantity })}
                  />

                  <OptionSelector
                    title="Garment Type"
                    options={apparelCatalog.garmentTypes}
                    selected={apparelQuote.garmentType}
                    onSelect={(garmentType) => updateApparelQuote({ garmentType })}
                  />

                  <OptionSelector
                    title="Garment Color"
                    options={apparelCatalog.garmentColors}
                    selected={apparelQuote.garmentColor}
                    onSelect={(garmentColor) => {
                      const estimatedInkCount = getEstimatedInkColorCount(
                        artworkAnalysis,
                        garmentColor
                      );

                      updateApparelQuote({
                        garmentColor,
                        inkColors: formatInkColorOption(estimatedInkCount),
                      });
                    }}
                  />

                  <div>
                    <div className="mb-3">
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                        Print Locations
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#6f695e]">
                        Choose all that apply.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {apparelCatalog.printLocations.map((location) => {
                        const isSelected = apparelQuote.printLocations.includes(location);

                        return (
                          <button
                            key={location}
                            type="button"
                            onClick={() => togglePrintLocation(location)}
                            className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                              isSelected
                                ? "border-[#2E5037] bg-[#2E5037] text-white"
                                : "border-[#dfd0b8] bg-[#F8F5EE] text-[#171717] hover:bg-white"
                            }`}
                          >
                            {location}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <OptionSelector
                    title="Ink Colors"
                    options={apparelCatalog.inkColors}
                    selected={apparelQuote.inkColors}
                    onSelect={(inkColors) => updateApparelQuote({ inkColors })}
                  />

                  {artworkAnalysis?.estimatedColorCount && (
                    <div className="rounded-2xl border border-[#dfd0b8] bg-[#F8F5EE] p-4">
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                        Auto Color Count
                      </p>

                      <div className="mt-3 grid gap-3 text-sm font-bold text-[#6f695e] sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.12em]">
                            Artwork
                          </p>
                          <p className="mt-1 text-lg font-black text-[#171717]">
                            {artworkAnalysis.estimatedColorCount} colors
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.12em]">
                            Underbase
                          </p>
                          <p className="mt-1 text-lg font-black text-[#171717]">
                            {apparelQuote.garmentColor === "White"
                              ? "+0"
                              : "+1 white"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-3">
                          <p className="text-xs uppercase tracking-[0.12em]">
                            Suggested
                          </p>
                          <p className="mt-1 text-lg font-black text-[#171717]">
                            {apparelQuote.inkColors}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-xs font-bold leading-5 text-[#6f695e]">
                        This is an estimate. If the shirt color is not white, the
                        app adds one extra color for a white underbase.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                      Size Breakdown
                    </label>

                    <textarea
                      value={apparelQuote.sizeBreakdown}
                      onChange={(event) =>
                        updateApparelQuote({ sizeBreakdown: event.target.value })
                      }
                      placeholder="Example: S-2, M-8, L-10, XL-4"
                      className="mt-3 min-h-28 w-full rounded-2xl border border-[#dfd0b8] bg-[#F8F5EE] p-4 font-bold text-[#171717] outline-none transition focus:border-[#2E5037] focus:bg-white"
                    />
                  </div>
                </>
              ) : (
                <>
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
                    title="Shape"
                    options={stickerCatalog.shapes}
                    selected={order.product.shape}
                    onSelect={(shape) => updateProduct({ shape })}
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
                </>
              )}

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

          <aside className="space-y-6 lg:col-span-5">
            {isApparelSelected ? (
              <ApparelPreview
                artworkPreview={artworkPreview}
                garmentType={apparelQuote.garmentType}
                garmentColor={apparelQuote.garmentColor}
                printLocations={apparelQuote.printLocations}
                inkColors={apparelQuote.inkColors}
                quantity={apparelQuote.quantity}
              />
            ) : (
              <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-5 shadow-xl sm:p-8">
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

                <StickerPreview
                  artworkPreview={artworkPreview}
                  material={order.product.material}
                  finish={order.product.finish}
                  size={order.product.size}
                  shape={order.product.shape}
                />

                <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  <div className="rounded-2xl bg-[#F8F5EE] p-4">
                    <p className="text-xs font-bold uppercase text-[#6f695e]">
                      Size
                    </p>
                    <p className="mt-1 font-black">{order.product.size}</p>
                  </div>

                  <div className="rounded-2xl bg-[#F8F5EE] p-4">
                    <p className="text-xs font-bold uppercase text-[#6f695e]">
                      Shape
                    </p>
                    <p className="mt-1 font-black">{order.product.shape}</p>
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
            )}

            <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-5 text-sm font-bold leading-6 text-[#6f695e] shadow-xl sm:p-6">
              Not sure what to choose? Send the quote anyway. Gorilla Salem will
              review the artwork and help confirm the best setup before anything
              goes to print.
            </div>

            {isApparelSelected ? (
              <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                  Apparel Summary
                </p>

                <div className="mt-5 space-y-3 text-sm font-bold text-[#6f695e]">
                  <div className="flex justify-between gap-4">
                    <span>Product</span>
                    <span className="text-right text-[#171717]">{apparelQuote.garmentType}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Quantity</span>
                    <span className="text-right text-[#171717]">{apparelQuote.quantity}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Color</span>
                    <span className="text-right text-[#171717]">{apparelQuote.garmentColor}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Locations</span>
                    <span className="text-right text-[#171717]">{apparelQuote.printLocations.join(", ")}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Ink</span>
                    <span className="text-right text-[#171717]">{apparelQuote.inkColors}</span>
                  </div>

                  {artworkAnalysis?.estimatedColorCount && (
                    <div className="flex justify-between gap-4">
                      <span>Auto Count</span>
                      <span className="text-right text-[#171717]">
                        {artworkAnalysis.estimatedColorCount}
                        {apparelQuote.garmentColor === "White"
                          ? ""
                          : " + underbase"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl bg-[#F8F5EE] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
                    Size Breakdown
                  </p>
                  <p className="mt-2 text-sm font-bold text-[#171717]">
                    {apparelQuote.sizeBreakdown || "Not entered yet"}
                  </p>
                </div>

                <div className="mt-5 rounded-2xl bg-[#fff7e8] p-4">
                  <p className="text-sm font-bold leading-6 text-[#6f695e]">
                    Apparel pricing is reviewed manually because garment brand,
                    sizes, print locations, and artwork can change the final price.
                  </p>
                </div>
              </div>
            ) : (
              <OrderSummary order={order} />
            )}

            <ArtworkAnalysisCard analysis={artworkAnalysis} />

            {isApparelSelected ? (
              <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
                  Required Info
                </p>

                {currentValidationErrors.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-[#eef7ee] p-4 text-sm font-black text-[#2E5037]">
                    Apparel quote is ready to submit.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm font-bold text-[#6f695e]">
                    {currentValidationErrors.map((error) => (
                      <li key={error}>• {error}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <OrderValidation order={order} />
            )}

            <div className="mt-6">
              {readyToSubmit ? (
                <SubmitButton onSubmit={submitOrder} isLoading={isSubmitting} />
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
        <footer className="mt-12 rounded-[2rem] border border-[#dfd0b8] bg-white p-6 text-center shadow-xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Gorilla Salem
          </p>
          <p className="mt-2 text-lg font-black text-[#171717]">
            Custom printing, local service, real people reviewing your order.
          </p>
          <p className="mt-2 text-sm font-bold text-[#6f695e]">
            Salem, Massachusetts • quote@gorillasalem.com
          </p>
        </footer>
      </div>
    </main>
  );
}
