"use client";

import { useEffect, useMemo, useState } from "react";

import Header from "../components/Header";
import UploadBox from "../components/upload/UploadBox";
import NeedByDate from "../components/NeedByDate";
import CustomerForm from "../components/CustomerForm";
import SubmitButton from "../components/SubmitButton";
import OrderSummary from "../components/summary/OrderSummary";
import OrderValidation from "../components/summary/OrderValidation";
import ArtworkAnalysisCard from "../components/summary/ArtworkAnalysisCard";
import ApparelPreview from "../components/preview/ApparelPreview";
import AddOnsCard from "../features/addons/AddOnsCard";

import { defaultApparelQuote } from "../lib/apparel";
import {
  allowsDoubleSided,
  CUSTOM_SIZE,
  defaultSignsQuote,
  getFinishingOptions,
  getSignDimensions,
  getSignProduct,
  getSignSizeLabel,
  getSizeOptions,
} from "../lib/signs";
import { calculateSignsPricing } from "../lib/signs-pricing";
import { productCategories } from "../lib/products";
import { defaultOrder } from "../lib/order";
import { AddOnOffer, toAddOn } from "../lib/addons";
import { getShippingPrice, getStickerPrice } from "../lib/pricing";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { apparelCatalogStyles } from "../lib/apparel-catalog";
import { getOrderValidationErrors } from "../lib/validation";
import { analyzeArtworkFile, ArtworkAnalysis } from "../lib/artwork";

import QuoteConfirmationScreen from "../features/QuoteConfirmation";
import QuoteReviewCard from "../features/QuoteReviewCard";
import DecalBuilder from "../features/decals/DecalBuilder";
import DecalPreviewCard from "../features/decals/DecalPreviewCard";
import ApparelBuilder from "../features/apparel/ApparelBuilder";
import ApparelSummaryCard from "../features/apparel/ApparelSummaryCard";
import SignsBuilder from "../features/signs/SignsBuilder";
import SignsSummaryCard from "../features/signs/SignsSummaryCard";
import SignsPreviewCard from "../features/signs/SignsPreviewCard";
import type {
  QuoteConfirmation,
  SsCatalogColor,
  SsCatalogProduct,
  SsCatalogResponse,
  SsCatalogSize,
} from "../features/types";

export default function Home() {
  const [selectedProductId, setSelectedProductId] = useState("stickers");
  const [submittedProductId, setSubmittedProductId] = useState("stickers");
  const [order, setOrder] = useState(defaultOrder);
  const [apparelQuote, setApparelQuote] = useState(defaultApparelQuote);
  const [signsQuote, setSignsQuote] = useState(defaultSignsQuote);
  const [ssProducts, setSsProducts] = useState<SsCatalogProduct[]>([]);
  const [selectedSsProductId, setSelectedSsProductId] = useState("");
  const [selectedSsColorName, setSelectedSsColorName] = useState("");
  const [selectedSsSizeName, setSelectedSsSizeName] = useState("");
  const [selectedApparelCategory, setSelectedApparelCategory] = useState("All");
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({});
  const [ssCatalogStatus, setSsCatalogStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [ssCatalogError, setSsCatalogError] = useState("");
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artworkAnalysis, setArtworkAnalysis] =
    useState<ArtworkAnalysis | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quoteSubmitted, setQuoteSubmitted] = useState(false);
  const [quoteConfirmation, setQuoteConfirmation] =
    useState<QuoteConfirmation | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );

  const isApparelSelected = selectedProductId === "apparel";
  const isApparelSubmitted = submittedProductId === "apparel";
  const isSignsSelected = selectedProductId === "signs";
  const isSignsSubmitted = submittedProductId === "signs";

  const selectedSsProduct = useMemo(() => {
    return (
      ssProducts.find((product) => product.id === selectedSsProductId) ||
      ssProducts[0] ||
      null
    );
  }, [selectedSsProductId, ssProducts]);

  const selectedSsColor = useMemo(() => {
    return (
      selectedSsProduct?.colors.find(
        (color) => color.colorName === selectedSsColorName
      ) ||
      selectedSsProduct?.colors[0] ||
      null
    );
  }, [selectedSsColorName, selectedSsProduct]);

  const selectedSsSize = useMemo(() => {
    return (
      selectedSsColor?.sizes.find((size) => size.sizeName === selectedSsSizeName) ||
      selectedSsColor?.sizes.find((size) => size.isAvailable) ||
      selectedSsColor?.sizes[0] ||
      null
    );
  }, [selectedSsColor, selectedSsSizeName]);

  const selectedGarmentPrice = selectedSsSize?.markedUpPrice || 0;
  const selectedGarmentImage = selectedSsColor?.frontImage || null;
  const selectedGarmentIsOutOfStock = selectedSsColor?.outOfStock || false;
  const selectedGarmentLabel =
    selectedSsProduct?.customerLabel ||
    selectedSsProduct?.displayName ||
    apparelQuote.garmentType;

  const sizeOptionsForBreakdown = useMemo(() => {
    const sizes =
      selectedSsColor?.sizes
        .map((size) => size.sizeName)
        .filter(Boolean) || [];

    if (sizes.length === 0) {
      return ["S", "M", "L", "XL", "2XL"];
    }

    return Array.from(new Set(sizes));
  }, [selectedSsColor]);

  const sizeQuantityTotal = useMemo(() => {
    return Object.values(sizeQuantities).reduce(
      (total, quantity) => total + quantity,
      0
    );
  }, [sizeQuantities]);

  const sizeBreakdownFromButtons = useMemo(() => {
    return Object.entries(sizeQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([size, quantity]) => `${size}-${quantity}`)
      .join(", ");
  }, [sizeQuantities]);

  const sizeBreakdownMatchesQuantity =
    sizeQuantityTotal === apparelQuote.quantity;

  const apparelCategories = useMemo(() => {
    const categories = ssProducts
      .map((product) => product.customerCategory)
      .filter(Boolean);

    return ["All", ...Array.from(new Set(categories))];
  }, [ssProducts]);

  const filteredSsProducts = useMemo(() => {
    if (selectedApparelCategory === "All") {
      return ssProducts;
    }

    return ssProducts.filter(
      (product) => product.customerCategory === selectedApparelCategory
    );
  }, [selectedApparelCategory, ssProducts]);

  const signsPricing = useMemo(() => {
    const product = getSignProduct(signsQuote.productId);
    const { widthInches, heightInches } = getSignDimensions(signsQuote);

    // Some products (e.g. window/wall graphics) are always quoted by hand —
    // they're measured to the customer's space, so there's nothing to compute.
    if (product.pricingMethod === null) {
      return {
        priceable: false as const,
        reason:
          "We price these to your space. Send the request with your measurements or a photo and Gorilla Salem will reply with a quote.",
        lines: [],
        subtotal: 0,
        total: 0,
        unitPrice: 0,
        sqftEach: 0,
        note: "",
      };
    }

    return calculateSignsPricing({
      method: product.pricingMethod,
      quantity: signsQuote.quantity,
      sizeKey: signsQuote.size,
      widthInches,
      heightInches,
      material: signsQuote.material,
      doubleSided: signsQuote.doubleSided,
      stepStakes: signsQuote.finishing === "With Step Stakes",
      // Banners use this for the no-hem credit.
      finishing: signsQuote.finishing,
      isCustomSize: signsQuote.size === CUSTOM_SIZE,
      bannerAddOns: signsQuote.bannerAddOns,
    });
  }, [signsQuote]);

  const apparelPricing = useMemo(() => {
    return calculateApparelPricing({
      quantity: apparelQuote.quantity,
      garmentUnitPrice: selectedGarmentPrice,
      printLocations: apparelQuote.printLocations,
      inkColors: apparelQuote.inkColors,
      hasUnderbase:
        apparelQuote.garmentColor !== "White" &&
        Boolean(artworkAnalysis?.estimatedColorCount),
    });
  }, [
    apparelQuote.quantity,
    apparelQuote.printLocations,
    apparelQuote.inkColors,
    apparelQuote.garmentColor,
    selectedGarmentPrice,
    artworkAnalysis?.estimatedColorCount,
  ]);

  useEffect(() => {
    async function loadSsCatalog() {
      setSsCatalogStatus("loading");
      setSsCatalogError("");

      try {
        const styleQuery = encodeURIComponent(apparelCatalogStyles.join(","));
        const response = await fetch(`/api/ss-catalog?style=${styleQuery}`);

        if (!response.ok) {
          throw new Error("S&S catalog did not load.");
        }

        const data = (await response.json()) as SsCatalogResponse;

        if (data.error) {
          throw new Error(data.error);
        }

        setSsProducts(data.products);
        setSsCatalogStatus("loaded");

        const firstProduct = data.products[0];
        const firstColor =
          firstProduct?.colors.find((color) => color.isAvailable) ||
          firstProduct?.colors[0];
        const firstSize =
          firstColor?.sizes.find((size) => size.isAvailable) ||
          firstColor?.sizes[0];

        if (firstProduct) {
          setSelectedSsProductId(firstProduct.id);
        }

        if (firstColor) {
          setSelectedSsColorName(firstColor.colorName);
        }

        if (firstSize) {
          setSelectedSsSizeName(firstSize.sizeName);
        }

        if (firstProduct || firstColor) {
          setApparelQuote((current) => ({
            ...current,
            garmentType:
              firstProduct?.customerLabel ||
              firstProduct?.displayName ||
              current.garmentType,
            garmentColor: firstColor?.colorName || current.garmentColor,
          }));
        }
      } catch (error) {
        console.error(error);
        setSsCatalogStatus("error");
        setSsCatalogError(
          error instanceof Error ? error.message : "Unable to load S&S catalog."
        );
      }
    }

    loadSsCatalog();
  }, []);

  function handleSsProductSelect(product: SsCatalogProduct) {
    const firstColor =
      product.colors.find((color) => color.isAvailable) || product.colors[0];
    const firstSize =
      firstColor?.sizes.find((size) => size.isAvailable) || firstColor?.sizes[0];

    setSelectedSsProductId(product.id);
    setSelectedSsColorName(firstColor?.colorName || "");
    setSelectedSsSizeName(firstSize?.sizeName || "");

    setApparelQuote((current) => ({
      ...current,
      garmentType: product.customerLabel || product.displayName,
      garmentColor: firstColor?.colorName || current.garmentColor,
    }));
  }

  function handleApparelCategorySelect(category: string) {
    setSelectedApparelCategory(category);

    const firstProduct =
      category === "All"
        ? ssProducts[0]
        : ssProducts.find((product) => product.customerCategory === category);

    if (firstProduct) {
      handleSsProductSelect(firstProduct);
    }
  }

  function updateSizeQuantity(sizeName: string, change: number) {
    setSizeQuantities((current) => {
      const nextQuantity = Math.max(0, (current[sizeName] || 0) + change);
      const next = {
        ...current,
        [sizeName]: nextQuantity,
      };

      if (nextQuantity === 0) {
        delete next[sizeName];
      }

      const nextBreakdown = Object.entries(next)
        .filter(([, quantity]) => quantity > 0)
        .map(([size, quantity]) => `${size}-${quantity}`)
        .join(", ");

      setApparelQuote((quote) => ({
        ...quote,
        sizeBreakdown: nextBreakdown,
      }));

      return next;
    });
  }

  function setSizeQuantity(sizeName: string, value: number) {
    setSizeQuantities((current) => {
      const nextQuantity = Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
      const next = {
        ...current,
        [sizeName]: nextQuantity,
      };

      if (nextQuantity === 0) {
        delete next[sizeName];
      }

      const nextBreakdown = Object.entries(next)
        .filter(([, quantity]) => quantity > 0)
        .map(([size, quantity]) => `${size}-${quantity}`)
        .join(", ");

      setApparelQuote((quote) => ({
        ...quote,
        sizeBreakdown: nextBreakdown,
      }));

      return next;
    });
  }

  function resetSizeBreakdown() {
    setSizeQuantities({});
    setApparelQuote((current) => ({
      ...current,
      sizeBreakdown: "",
    }));
  }

  function handleSsColorSelect(color: SsCatalogColor) {
    const firstSize =
      color.sizes.find((size) => size.isAvailable) || color.sizes[0];

    const estimatedInkCount = getEstimatedInkColorCount(
      artworkAnalysis,
      color.colorName
    );

    setSelectedSsColorName(color.colorName);
    setSelectedSsSizeName(firstSize?.sizeName || "");

    setApparelQuote((current) => ({
      ...current,
      garmentColor: color.colorName,
      inkColors: formatInkColorOption(estimatedInkCount),
    }));
  }

  function handleSsSizeSelect(size: SsCatalogSize) {
    setSelectedSsSizeName(size.sizeName);
  }

  function getDecalFinishFromMaterial(material: string) {
    if (material.toLowerCase().includes("matte")) {
      return "Matte";
    }

    return "Gloss";
  }

  function recalculateOrder(nextOrder: typeof order) {
    const finish = getDecalFinishFromMaterial(nextOrder.product.material);

    const stickerPrice = getStickerPrice(
      nextOrder.product.quantity,
      nextOrder.product.material,
      finish
    );

    const shippingPrice = getShippingPrice(nextOrder.production.deliveryMethod);

    return {
      ...nextOrder,
      product: {
        ...nextOrder.product,
        finish,
      },
      pricing: {
        ...nextOrder.pricing,
        stickerPrice,
        shippingPrice,
        total: stickerPrice + shippingPrice,
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

  /**
   * Add-ons are quote requests, not purchases. Deliberately NOT routed
   * through recalculateOrder() — they must never move `pricing.total`, which
   * both the email and the Printavo note divide by the primary product's
   * quantity to get a per-unit price.
   */
  function toggleAddOn(offer: AddOnOffer, checked: boolean) {
    setOrder((prev) => ({
      ...prev,
      addOns: checked
        ? [...prev.addOns.filter((a) => a.id !== offer.id), toAddOn(offer)]
        : prev.addOns.filter((a) => a.id !== offer.id),
    }));
  }

  function updateProduction(updates: Partial<typeof order.production>) {
    // Recalculate: changing the delivery method changes the shipping total.
    setOrder(
      recalculateOrder({
        ...order,
        production: {
          ...order.production,
          ...updates,
        },
      })
    );
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
      // Auto-check the magenta cut line when we detect one in the file.
      // (Only ever turns it on; never overrides a manual choice to off.)
      product: analysis.magentaDetected
        ? { ...order.product, magentaCutLine: true }
        : order.product,
      artwork: {
        file,
      },
    });
  }

  function updateSignsQuote(updates: Partial<typeof signsQuote>) {
    const next = { ...signsQuote, ...updates };

    // Switching to a material that can't be printed double-sided (13 oz or
    // mesh) must clear the flag. The checkbox hides itself, but without this
    // the stale `true` would keep charging the surcharge and keep saying
    // "Double-sided" on the summary, the review card and the shop email.
    const product = getSignProduct(next.productId);
    if (next.doubleSided && !allowsDoubleSided(product, next.material)) {
      next.doubleSided = false;
    }

    // Same hazard for finishing: only 18 oz may skip the hem, so switching to
    // 13 oz or mesh must drop a stale "No Hem or Grommets" back to the default
    // rather than leaving an option the new material can't have.
    const validFinishing = getFinishingOptions(product, next.material);
    if (!validFinishing.includes(next.finishing)) {
      next.finishing = validFinishing[0];
    }

    setSignsQuote(next);
  }

  function handleSignProductSelect(productId: string) {
    // Sizes/materials/finishing differ per sign type, so reset them to that
    // product's own defaults instead of keeping an invalid leftover choice.
    const product = getSignProduct(productId);

    setSignsQuote({
      ...signsQuote,
      productId,
      size: getSizeOptions(product)[0],
      customSize: "",
      customWidthInches: 0,
      customHeightInches: 0,
      material: product.materials[0],
      finishing: product.finishing[0],
      doubleSided: allowsDoubleSided(product, product.materials[0])
        ? signsQuote.doubleSided
        : false,
    });
  }

  function getSignsValidationErrors() {
    const errors: string[] = [];

    if (!order.customer.customerName.trim()) {
      errors.push("Enter your name.");
    }

    if (!order.customer.email.trim()) {
      errors.push("Enter your email.");
    }

    if (!order.artwork.file) {
      errors.push("Upload your artwork.");
    }

    if (!order.production.needBy.trim()) {
      errors.push("Enter the date you need this in hand.");
    }

    if (
      signsQuote.size === CUSTOM_SIZE &&
      (signsQuote.customWidthInches <= 0 || signsQuote.customHeightInches <= 0)
    ) {
      errors.push("Enter the width and height for your custom size.");
    }

    return errors;
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

    // A special order is priced by hand, so the strict menu rules (print
    // locations, matching size breakdown) don't apply — we just need to know
    // what they want.
    if (apparelQuote.specialOrder) {
      if (!apparelQuote.specialOrderNotes.trim()) {
        errors.push("Tell us what you need for your special order.");
      }
      return errors;
    }

    if (apparelQuote.printLocations.length === 0) {
      errors.push("Choose at least one print location.");
    }

    if (!apparelQuote.sizeBreakdown.trim()) {
      errors.push("Enter a size breakdown.");
    } else if (sizeQuantityTotal !== apparelQuote.quantity) {
      errors.push(
        `Size breakdown must total ${apparelQuote.quantity}. Current total is ${sizeQuantityTotal}.`
      );
    }

    return errors;
  }

  function getCurrentValidationErrors() {
    if (isApparelSelected) {
      return getApparelValidationErrors();
    }

    if (isSignsSelected) {
      return getSignsValidationErrors();
    }

    return getOrderValidationErrors(order);
  }

  function buildQuotePayload() {
    if (isSignsSelected) {
      const product = getSignProduct(signsQuote.productId);

      return {
        customer: order.customer,
        product: {
          type: "Banners & Signs",
          signType: product.label,
          quantity: signsQuote.quantity,
          size: getSignSizeLabel(signsQuote),
          material: signsQuote.material,
          finishing: signsQuote.finishing,
          sides: signsQuote.doubleSided ? "Double-sided" : "Single-sided",
        },
        artwork: {
          fileName: order.artwork.file?.name || null,
        },
        production: order.production,
        pricing: signsPricing.priceable
          ? {
              total: signsPricing.total,
              unitPrice: signsPricing.unitPrice,
              lines: signsPricing.lines,
              quoteRequired: false,
              note: `${signsPricing.note} Estimate — Gorilla Salem confirms artwork and add-ons before production.`,
            }
          : {
              total: 0,
              quoteRequired: true,
              note:
                signsPricing.reason ||
                "Priced by hand. Gorilla Salem will reply with the price.",
            },
      };
    }

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
          specialOrder: apparelQuote.specialOrder,
          specialOrderNotes: apparelQuote.specialOrderNotes,
          supplier: {
            source: "S&S Activewear",
            productName: selectedGarmentLabel || "Not selected",
            supplierProductName: selectedSsProduct?.displayName || "Not selected",
            catalogStyle: selectedSsProduct?.catalogStyle || "Not selected",
            colorName: selectedSsColor?.colorName || "Not selected",
            sampleSize: selectedSsSize?.sizeName || "Not selected",
            sku: selectedSsSize?.sku || "Not selected",
            markedUpGarmentPrice: selectedGarmentPrice,
            image: selectedGarmentImage,
            outOfStock: selectedGarmentIsOutOfStock,
          },
        },
        artwork: {
          fileName: order.artwork.file?.name || null,
        },
        production: order.production,
        // A special order gets no online estimate — the menu pricing doesn't
        // describe what they're actually asking for.
        pricing: apparelQuote.specialOrder
          ? {
              total: 0,
              quoteRequired: true,
              note: "Special order — priced by hand by Gorilla Salem.",
            }
          : {
              ...apparelPricing,
              quoteRequired: false,
              note: "Estimated apparel pricing. Final pricing reviewed by Gorilla Salem.",
            },
      };
    }

    return order;
  }

  async function submitOrder() {
    const errors = getCurrentValidationErrors();

    setSubmitError(null);

    if (errors.length > 0) {
      setSubmitError(
        "Please complete the missing information below before requesting a quote."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Send as multipart so the actual artwork file rides along with the quote
      // (the server attaches it to the quote email). No Content-Type header —
      // the browser sets the multipart boundary automatically.
      const formData = new FormData();
      formData.append("order", JSON.stringify(buildQuotePayload()));
      formData.append("artworkAnalysis", JSON.stringify(artworkAnalysis));

      if (order.artwork.file) {
        formData.append("artwork", order.artwork.file, order.artwork.file.name);
      }

      const response = await fetch("/api/quote", {
        method: "POST",
        body: formData,
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
      setSubmitError(
        "Unable to submit your quote right now. Please try again in a moment."
      );
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
Deadline Type: ${order.production.deadlineType}
Delivery: ${
      order.production.deliveryMethod === "Ship"
        ? "Ship to customer"
        : "Local pickup in Salem"
    }`;

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

    if (isSignsSubmitted) {
      const signProduct = getSignProduct(signsQuote.productId);

      return `GORILLA SALEM SIGNS QUOTE REQUEST

Quote Number: ${quoteNumber}
Submitted: ${submittedAt}

${customerSection}

SIGNS DETAILS
Product: ${signProduct.label}
Quantity: ${signsQuote.quantity.toLocaleString()}
Size: ${getSignSizeLabel(signsQuote)}
Material: ${signsQuote.material}
Finishing: ${signsQuote.finishing}
Sides: ${signsQuote.doubleSided ? "Double-sided" : "Single-sided"}

${timelineSection}

ESTIMATE
${
  signsPricing.priceable
    ? `${signsPricing.lines
        .filter((l) => l.amount !== 0)
        .map((l) => `${l.label}: $${l.amount.toFixed(2)}`)
        .join("\n")}
Estimated Total: $${signsPricing.total.toFixed(2)}${
        signsQuote.quantity > 1
          ? `\nEstimated Each: $${signsPricing.unitPrice.toFixed(2)}`
          : ""
      }
${signsPricing.note}`
    : signsPricing.reason ||
      "Priced by hand. Gorilla Salem will reply with the price."
}

${artworkSection}

${notesSection}

This is a quote request. Gorilla Salem will confirm pricing, timeline, and artwork readiness before production starts.`;
    }

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

S&S CATALOG DETAILS
Customer-Facing Product: ${selectedGarmentLabel || "Not selected"}
S&S Product: ${selectedSsProduct?.displayName || "Not selected"}
S&S Style: ${selectedSsProduct?.catalogStyle || "Not selected"}
Color: ${selectedSsColor?.colorName || "Not selected"}
Sample Size: ${selectedSsSize?.sizeName || "Not selected"}
SKU: ${selectedSsSize?.sku || "Not selected"}
Marked-Up Garment Price: ${
        selectedGarmentPrice ? `$${selectedGarmentPrice.toFixed(2)}` : "N/A"
      }
Availability: ${selectedGarmentIsOutOfStock ? "Out of stock" : "Available"}
Image: ${selectedGarmentImage || "N/A"}

${timelineSection}

ESTIMATE
Estimated Apparel Total: $${apparelPricing.total.toFixed(2)}
Estimated Each: $${apparelPricing.unitPrice.toFixed(2)}
Garments: $${apparelPricing.garmentTotal.toFixed(2)}
Printing: $${apparelPricing.printTotal.toFixed(2)}
Setup / Screens: $${apparelPricing.setupTotal.toFixed(2)}
Locations: ${apparelQuote.printLocations.length}
Pricing Note: Final pricing reviewed by Gorilla Salem.

${artworkSection}

${notesSection}

This is an estimate request, not a final invoice. Gorilla Salem will confirm pricing, timeline, and artwork readiness before production starts.`;
    }

    return `GORILLA SALEM STICKER QUOTE REQUEST

Quote Number: ${quoteNumber}
Submitted: ${submittedAt}

${customerSection}

STICKER DETAILS
Product: Custom Stickers
Quantity: ${order.product.quantity.toLocaleString()}
Size: ${order.product.size}
Shape: ${order.product.shape}
Sticker Type: ${order.product.material}
Art Placement: ${order.product.artScale}% size, ${order.product.artMargin}% ${
      order.product.shape === "Die Cut" ? "cut border" : "margin"
    }
Magenta Cut Line: ${order.product.magentaCutLine ? "Yes — art includes a magenta cut line" : "No"}

${timelineSection}

ESTIMATE
Stickers: $${order.pricing.stickerPrice.toFixed(2)}
Shipping: ${
      order.pricing.shippingPrice > 0
        ? `$${order.pricing.shippingPrice.toFixed(2)}`
        : "Free (local pickup)"
    }
Estimated Total: $${order.pricing.total.toFixed(2)}
Estimated Each: $${unitPrice.toFixed(2)} per sticker

${artworkSection}

${notesSection}

This is an estimate, not a final invoice. Gorilla Salem will confirm pricing, timeline, and artwork readiness before production starts.`;
  }

  async function copyQuoteDetails() {
    try {
      await navigator.clipboard.writeText(getQuoteDetailsText());
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch (error) {
      console.error(error);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 4000);
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
    setSignsQuote(defaultSignsQuote);
    setSelectedProductId("stickers");
    setSubmittedProductId("stickers");
    setArtworkPreview(null);
    setArtworkAnalysis(null);
    setSizeQuantities({});
    setQuoteConfirmation(null);
    setQuoteSubmitted(false);
    setIsSubmitting(false);
    setSubmitError(null);
    setCopyStatus("idle");
  }

  // Price per sticker, excluding shipping — shipping is shown as its own line.
  const unitPrice = order.pricing.stickerPrice / order.product.quantity;
  const currentValidationErrors = getCurrentValidationErrors();
  // Every flow now routes through getCurrentValidationErrors(), which returns
  // the sticker rules for stickers, so one check covers all three.
  const readyToSubmit = currentValidationErrors.length === 0;

  if (quoteSubmitted) {
    return (
      <QuoteConfirmationScreen
        quoteConfirmation={quoteConfirmation}
        order={order}
        isApparelSubmitted={isApparelSubmitted}
        isSignsSubmitted={isSignsSubmitted}
        signsQuote={signsQuote}
        signsTotal={signsPricing.priceable ? signsPricing.total : null}
        apparelQuote={apparelQuote}
        selectedGarmentLabel={selectedGarmentLabel}
        selectedSsColor={selectedSsColor}
        apparelPricing={apparelPricing}
        unitPrice={unitPrice}
        copyStatus={copyStatus}
        emailHref={getEmailQuoteLink()}
        onCopy={copyQuoteDetails}
        onStartNew={startNewQuote}
        onBackToBuilder={() => setQuoteSubmitted(false)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-10">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--rush-red)]">
            Printed Locally in Salem, MA
          </p>

          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.08em] text-[var(--ink-black)] sm:text-5xl lg:text-6xl">
            Custom print quotes made simple.
          </h1>

          <p className="mt-5 max-w-2xl text-xl leading-8 text-[var(--ink-muted)]">
            Choose your details, upload your artwork, and get a live estimate or
            quote request before sending it to Gorilla Salem.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className=" bg-white px-4 py-2 text-sm font-black text-[var(--gorilla-green)]">
              Hand-printed locally
            </span>
            <span className=" bg-white px-4 py-2 text-sm font-black text-[var(--gorilla-green)]">
              Salem, Massachusetts
            </span>
            <span className=" bg-white px-4 py-2 text-sm font-black text-[var(--gorilla-green)]">
              Real proof review before production
            </span>
          </div>
        </div>

        <section className="mb-8 border border-[var(--rule)] bg-white p-5 sm:p-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
                Product Type
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--ink-black)]">
                What do you want to quote?
              </h2>
            </div>

            <p className="max-w-md text-sm font-bold leading-6 text-[var(--ink-muted)]">
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
                  className={` border p-5 text-left transition ${
                    isSelected
                      ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                      : isActive
                      ? "border-[var(--rule)] bg-white hover:-translate-y-0.5"
                      : "cursor-not-allowed border-[var(--rule)] bg-[var(--shirt-blank)] opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-black text-[var(--ink-black)]">
                      {product.title}
                    </p>

                    <span
                      className={` px-3 py-1 text-xs font-black ${
                        isSelected
                          ? "bg-[var(--gorilla-green)] text-white"
                          : "bg-[var(--shirt-blank)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {product.badge}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-muted)]">
                    {product.description}
                  </p>

                  <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[var(--rush-red)]">
                    {isActive ? "Available now" : "Coming soon"}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section className=" border border-[var(--rule)] bg-white p-5 sm:p-8 lg:col-span-7">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
                  Step 1
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">
                  {isApparelSelected
                    ? "Build Your Apparel Quote"
                    : isSignsSelected
                    ? "Build Your Signs Quote"
                    : "Choose Your Sticker Details"}
                </h2>
              </div>

              <div className=" bg-[var(--shirt-blank)] px-4 py-2 text-sm font-bold text-[var(--ink-muted)]">
                {isApparelSelected
                  ? "Manual Quote"
                  : isSignsSelected
                  ? "Quote Request"
                  : "Sticker Estimate"}
              </div>
            </div>

            <div className="space-y-8">
              {isSignsSelected ? (
                <SignsBuilder
                  signsQuote={signsQuote}
                  deliveryMethod={order.production.deliveryMethod}
                  onUpdate={(updates) => updateSignsQuote(updates)}
                  onSelectProduct={handleSignProductSelect}
                  onSelectDeliveryMethod={(deliveryMethod) =>
                    updateProduction({ deliveryMethod })
                  }
                />
              ) : isApparelSelected ? (
                <ApparelBuilder
                  apparelQuote={apparelQuote}
                  artworkAnalysis={artworkAnalysis}
                  ssCatalogStatus={ssCatalogStatus}
                  ssCatalogError={ssCatalogError}
                  hasSsProducts={ssProducts.length > 0}
                  filteredSsProducts={filteredSsProducts}
                  apparelCategories={apparelCategories}
                  selectedApparelCategory={selectedApparelCategory}
                  selectedSsProduct={selectedSsProduct}
                  selectedSsColor={selectedSsColor}
                  selectedSsSize={selectedSsSize}
                  sizeOptionsForBreakdown={sizeOptionsForBreakdown}
                  sizeQuantities={sizeQuantities}
                  sizeQuantityTotal={sizeQuantityTotal}
                  sizeBreakdownFromButtons={sizeBreakdownFromButtons}
                  sizeBreakdownMatchesQuantity={sizeBreakdownMatchesQuantity}
                  onSelectQuantity={(quantity) =>
                    updateApparelQuote({ quantity })
                  }
                  onSelectCategory={handleApparelCategorySelect}
                  onSelectProduct={handleSsProductSelect}
                  onSelectColor={handleSsColorSelect}
                  onSelectSize={handleSsSizeSelect}
                  onSelectGarmentType={(garmentType) =>
                    updateApparelQuote({ garmentType })
                  }
                  onSelectFallbackGarmentColor={(garmentColor) => {
                    const estimatedInkCount = getEstimatedInkColorCount(
                      artworkAnalysis,
                      garmentColor
                    );

                    updateApparelQuote({
                      garmentColor,
                      inkColors: formatInkColorOption(estimatedInkCount),
                    });
                  }}
                  onTogglePrintLocation={togglePrintLocation}
                  onSelectInkColors={(inkColors) =>
                    updateApparelQuote({ inkColors })
                  }
                  onUpdateSpecialOrder={(updates) =>
                    updateApparelQuote(updates)
                  }
                  onUpdateSizeQuantity={updateSizeQuantity}
                  onSetSizeQuantity={setSizeQuantity}
                  onResetSizeBreakdown={resetSizeBreakdown}
                />
              ) : (
                <DecalBuilder
                  product={order.product}
                  deliveryMethod={order.production.deliveryMethod}
                  hasArtwork={Boolean(order.artwork.file)}
                  magentaDetected={Boolean(artworkAnalysis?.magentaDetected)}
                  onSelectDeliveryMethod={(deliveryMethod) =>
                    updateProduction({ deliveryMethod })
                  }
                  onUpdate={(updates) => updateProduct(updates)}
                  onSelectMaterial={(material) =>
                    updateProduct({
                      material,
                      finish: getDecalFinishFromMaterial(material),
                    })
                  }
                />
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
            {isSignsSelected ? (
              <SignsPreviewCard
                artworkPreview={artworkPreview}
                signsQuote={signsQuote}
              />
            ) : isApparelSelected ? (
              <ApparelPreview
                artworkPreview={artworkPreview}
                garmentType={selectedGarmentLabel}
                garmentColor={selectedSsColor?.colorName || apparelQuote.garmentColor}
                garmentImage={selectedGarmentImage}
                printLocations={apparelQuote.printLocations}
                inkColors={apparelQuote.inkColors}
                quantity={apparelQuote.quantity}
              />
            ) : (
              <DecalPreviewCard
                artworkPreview={artworkPreview}
                product={order.product}
                production={order.production}
                unitPrice={unitPrice}
                onUpdateProduct={(updates) => updateProduct(updates)}
              />
            )}

            <div className=" border border-[var(--rule)] bg-white p-5 text-sm font-bold leading-6 text-[var(--ink-muted)] sm:p-6">
              Not sure what to choose? Send the quote anyway. Gorilla Salem will
              review the artwork and help confirm the best setup before anything
              goes to print.
            </div>

            {isSignsSelected ? (
              <SignsSummaryCard
                signsQuote={signsQuote}
                production={order.production}
                pricing={signsPricing}
              />
            ) : isApparelSelected ? (
              <ApparelSummaryCard
                apparelQuote={apparelQuote}
                selectedSsSize={selectedSsSize}
                apparelPricing={apparelPricing}
                artworkAnalysis={artworkAnalysis}
              />
            ) : (
              <OrderSummary order={order} />
            )}

            {/* Rendered once, outside the three-way flow ternary above, so
                stickers / signs / apparel all get it from one place. It sits
                directly after the price because that is the only slot that is
                after the estimate on BOTH breakpoints — below `lg` the aside
                stacks under the entire form. */}
            <AddOnsCard
              flow={selectedProductId}
              addOns={order.addOns}
              note={order.addOnsNote}
              onToggle={toggleAddOn}
              onNoteChange={(value) =>
                setOrder((prev) => ({ ...prev, addOnsNote: value }))
              }
            />

            <ArtworkAnalysisCard analysis={artworkAnalysis} />

            <QuoteReviewCard
              isApparelSelected={isApparelSelected}
              isSignsSelected={isSignsSelected}
              order={order}
              apparelQuote={apparelQuote}
              apparelPricing={apparelPricing}
              signsQuote={signsQuote}
              signsTotal={signsPricing.priceable ? signsPricing.total : null}
              selectedGarmentLabel={selectedGarmentLabel}
              selectedSsColor={selectedSsColor}
              isReady={currentValidationErrors.length === 0}
            />


            {isApparelSelected || isSignsSelected ? (
              <div className=" border border-[var(--rule)] bg-white p-6">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
                  Required Info
                </p>

                {currentValidationErrors.length === 0 ? (
                  <p className="mt-4 bg-[var(--surface-ok)] p-4 text-sm font-black text-[var(--gorilla-green)]">
                    {isSignsSelected
                      ? "Signs quote is ready to submit."
                      : "Apparel quote is ready to submit."}
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm font-bold text-[var(--ink-muted)]">
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
              {submitError && (
                <p className="mb-3 bg-[var(--surface-rush)] p-4 text-sm font-bold leading-6 text-[var(--rush-red)]">
                  {submitError}
                </p>
              )}
              {readyToSubmit ? (
                <SubmitButton onSubmit={submitOrder} isLoading={isSubmitting} />
              ) : (
                <button
                  type="button"
                  disabled
                  // Matches SubmitButton's disabled treatment exactly — it is
                  // the same button switched off, not a different one.
                  className="w-full cursor-not-allowed border-2 border-[var(--rush-red)] bg-[var(--rush-red)] py-5 text-xl font-black text-white opacity-40"
                >
                  Complete required info
                </button>
              )}
            </div>
          </aside>
        </div>
        <footer className="mt-12 border border-[var(--rule)] bg-white p-6 text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
            Gorilla Salem
          </p>
          <p className="mt-2 text-lg font-black text-[var(--ink-black)]">
            Custom printing, local service, real people reviewing your order.
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--ink-muted)]">
            Salem, Massachusetts • quote@gorillasalem.com
          </p>
        </footer>
      </div>
    </main>
  );
}
