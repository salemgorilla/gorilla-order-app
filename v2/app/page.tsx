"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Header from "../components/Header";
import StepNav from "../components/StepNav";
import StepFooter from "../components/StepFooter";
import UploadBox from "../components/upload/UploadBox";
import ArtworkGuidance from "../components/upload/ArtworkGuidance";
import NeedByDate from "../components/NeedByDate";
import CustomerForm from "../components/CustomerForm";
import SubmitButton from "../components/SubmitButton";
import OrderSummary from "../components/summary/OrderSummary";
import EstimateBar from "../components/summary/EstimateBar";
import OrderValidation from "../components/summary/OrderValidation";
import ArtworkAnalysisCard from "../components/summary/ArtworkAnalysisCard";
import ApparelPreview from "../components/preview/ApparelPreview";
import AddOnsCard from "../features/addons/AddOnsCard";

import { defaultApparelQuote } from "../lib/apparel";
import {
  allowsDoubleSided,
  allowsReinforcement,
  REINFORCEMENT_ADD_ON_KEY,
  CUSTOM_SIZE,
  defaultSignsQuote,
  getFinishingOptions,
  getSignDimensions,
  getSignProduct,
  getSignSizeLabel,
  getSizeOptions,
  getYardSignSizeKey,
} from "../lib/signs";
import { calculateSignsPricing } from "../lib/signs-pricing";
import { productCategories } from "../lib/products";
import { defaultOrder } from "../lib/order";
import { AddOnOffer, toAddOn } from "../lib/addons";
import {
  describeStickerSize,
  getShippingPrice,
  getStickerPrice,
} from "../lib/pricing";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { apparelCatalogStyles } from "../lib/apparel-catalog";
import {
  getOrderFieldErrors,
  getOrderValidationErrors,
  type FieldErrors,
} from "../lib/validation";
import {
  getFirstStepWithError,
  getStep,
  getStepsWithErrors,
  type StepId,
} from "../lib/steps";
import { analyzeArtworkFile, ArtworkAnalysis } from "../lib/artwork";
import {
  isArtworkTooLargeToAttach,
  MAX_ATTACHED_ARTWORK_LABEL,
} from "../lib/upload-limits";
import { uploadArtworkToBlob } from "../lib/artwork-upload";
import { renderStickerProof } from "../lib/sticker-proof";
import {
  formatSizeLabel,
  sanitizeSizeInches,
  snapQuantity,
} from "../lib/units";
import { parseSizeInches } from "../components/preview/StickerShape";

import QuoteConfirmationScreen from "../features/QuoteConfirmation";
import QuoteReviewCard from "../features/QuoteReviewCard";
import DecalBuilder from "../features/decals/DecalBuilder";
import DecalPreviewCard from "../features/decals/DecalPreviewCard";
import ApparelBuilder from "../features/apparel/ApparelBuilder";
import ApparelRequestBuilder from "../features/apparel/ApparelRequestBuilder";
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
  // Which step is on screen. The form is no longer one scroll — see
  // lib/steps.ts for the step list and the field-to-step map.
  const [currentStepId, setCurrentStepId] = useState<StepId>("product");
  // Steps the customer has actually landed on. Completion is only claimed for
  // visited steps: several fields ship with valid defaults, so "no errors
  // here" is not evidence anybody looked at them.
  const [visitedStepIds, setVisitedStepIds] = useState<StepId[]>(["product"]);
  // Bumped on customer-driven navigation only, so the scroll-to-top of a new
  // step and the scroll-to-first-invalid after a failed submit never fight
  // over the same commit. A failed submit bumps the other token.
  const [stepScrollToken, setStepScrollToken] = useState(0);
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
  // Fields are marked only after a submit is attempted. Marking them on first
  // paint would meet a customer who has typed nothing with a page of red, and
  // the marks would be describing their own defaults back at them.
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  // Bumped on every failed submit rather than set, because the scroll must
  // repeat on the second attempt and a flag that is already true would not
  // re-run the effect.
  const [scrollToInvalidToken, setScrollToInvalidToken] = useState(0);
  // Percentage while artwork goes up to blob storage; null when not uploading.
  // A 60 MB file takes real time, and a submit button that just sits there
  // reads as a hang.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Whether a blob store is connected. Starts false so the box advertises the
  // smaller, always-true limit until we know better — never the other way
  // round, which is how it ended up promising 100 MB it could not deliver.
  const [directUploadEnabled, setDirectUploadEnabled] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );

  const isApparelSelected = selectedProductId === "apparel";
  // Apparel currently ships as a hand-quote request rather than the
  // configurator. Kept as its own flag so the day the configurator is signed
  // off, flipping products.tsx back to "active" is the whole change.
  const isApparelRequest =
    isApparelSelected &&
    productCategories.find((product) => product.id === "apparel")?.status ===
      "request";
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

  // Quantity is DERIVED from the size grid, never entered separately. Typing
  // M=4 L=6 2XL=2 is the order; there is no second number to disagree with it.
  // This is what removed the flow's only failure state — "Size breakdown must
  // total 24, current total is 22" — a reconciliation error the customer had
  // to solve because the form asked the same question twice.
  //
  // Synced onto apparelQuote rather than replacing it, so pricing, the shop
  // email and the Printavo push all keep reading `quantity` unchanged.
  useEffect(() => {
    // Only where the size grid exists. The apparel REQUEST flow has no grid —
    // the customer types a rough count — so letting this run there drove that
    // number straight back to the empty grid's total of 0 on every render.
    // The result was a form that complained "enter roughly how many you need"
    // about a box the customer had just filled in, and no way to clear it.
    if (isApparelRequest) return;

    setApparelQuote((prev) =>
      prev.quantity === sizeQuantityTotal
        ? prev
        : { ...prev, quantity: sizeQuantityTotal }
    );
  }, [sizeQuantityTotal, isApparelRequest]);

  // Kept true: the two can no longer diverge. Retained so the summary card and
  // builder props do not need rewiring in the same change.
  const sizeBreakdownMatchesQuantity = true;

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
      // Derived from real dimensions, not the old preset label. Yard signs are
      // frozen at 18x24 so this resolves to their table key; anything else
      // misses the table and is correctly priced by hand.
      sizeKey: getYardSignSizeKey(widthInches, heightInches),
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

  /**
   * What the sticky estimate stub shows. Pure selection over values the three
   * flows have already computed — deliberately no arithmetic of its own, so
   * the stub can never disagree with the summary card below it.
   */
  const estimateBar = useMemo(() => {
    if (isSignsSelected) {
      const product = getSignProduct(signsQuote.productId);
      return {
        label: `${signsQuote.quantity} × ${product.label}`,
        total: signsPricing.priceable ? signsPricing.total : 0,
        priceable: signsPricing.priceable,
        detail: signsPricing.priceable
          ? `${getSignSizeLabel(signsQuote)} · $${signsPricing.unitPrice.toFixed(
              2
            )} each`
          : "Send it over and we'll price it",
      };
    }

    if (isApparelSelected) {
      return {
        label: `${apparelQuote.quantity} × ${
          selectedGarmentLabel || "Apparel"
        }`,
        total: apparelPricing.total,
        priceable: !apparelQuote.specialOrder,
        detail: apparelQuote.specialOrder
          ? "Special order — we'll quote it"
          : `$${(apparelPricing.total / Math.max(1, apparelQuote.quantity)).toFixed(
              2
            )} each`,
      };
    }

    return {
      label: `${order.product.quantity} × ${describeStickerSize(
        order.product.size,
        {
          widthInches: order.product.widthInches,
          heightInches: order.product.heightInches,
        }
      )} ${order.product.shape} stickers`,
      total: order.pricing.total,
      priceable: true,
      detail: `$${(
        order.pricing.stickerPrice / Math.max(1, order.product.quantity)
      ).toFixed(2)} each`,
    };
  }, [
    isSignsSelected,
    isApparelSelected,
    signsQuote,
    signsPricing,
    apparelQuote,
    apparelPricing,
    selectedGarmentLabel,
    order.product,
    order.pricing,
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

        // Pin the Starter Tee rather than taking products[0]. The catalog is
        // sorted by displayName, so index 0 is an alphabetical accident — the
        // customer landed on whichever garment happened to sort first.
        const firstProduct =
          data.products.find((product) =>
            /starter tee/i.test(
              product.customerLabel || product.displayName || ""
            )
          ) || data.products[0];

        // Prefer White for the same reason the default is White: every other
        // colour carries an underbase charge, so anything else is a surcharge
        // the customer did not ask for.
        const firstColor =
          firstProduct?.colors.find(
            (color) => /^white$/i.test(color.colorName) && color.isAvailable
          ) ||
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

    // Sanitise here rather than only in the input's blur handler.
    //
    // Not a constraint on size — any dimension is allowed. This exists because
    // buildQuotePayload returns `order` verbatim for stickers, so whatever is
    // in state goes straight to the price, the payload and the shop's cut
    // spec. Normalising at the single point where price is computed keeps the
    // number shown, the number charged, and the size cut identical, and keeps
    // float noise like 1.7500000000000002 out of the order.
    const widthInches = sanitizeSizeInches(nextOrder.product.widthInches);
    const heightInches = sanitizeSizeInches(nextOrder.product.heightInches);
    // Quantity is NOT clamped into state — only into the price.
    //
    // snapQuantity is Math.max(1, ...), and running it on state meant an empty
    // quantity box silently became 1. The validation rule for quantity could
    // therefore never fire, so a customer who cleared the field saw no
    // complaint and a quiet "1 x 3\" stickers: $25.29" estimate. Keeping the
    // real value in state is what lets the field mark itself as missing and
    // block submit; the price still uses the snapped figure, so no quote's
    // number changes.
    const quantity = nextOrder.product.quantity;
    const quantityForPricing = snapQuantity(quantity);

    // Keep the label in step with the dimensions. Everything that shows a size
    // to the customer or to the shop — the review card, the proof card, the
    // quote email, the Printavo line — reads product.size, and nothing had
    // updated it since the size buttons were replaced by typed dimensions.
    const size =
      widthInches > 0 && heightInches > 0
        ? formatSizeLabel(widthInches, heightInches)
        : nextOrder.product.size;

    const stickerPrice = getStickerPrice(
      quantityForPricing,
      nextOrder.product.material,
      finish,
      nextOrder.product.size,
      { widthInches, heightInches }
    );

    const shippingPrice = getShippingPrice(nextOrder.production.deliveryMethod);

    return {
      ...nextOrder,
      product: {
        ...nextOrder.product,
        finish,
        widthInches,
        heightInches,
        quantity,
        size,
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

  /**
   * Accept a dropped file anywhere on the page.
   *
   * Without this, a drop that lands even slightly outside the dashed upload
   * box hits the browser default — Chrome OPENS the file and navigates away
   * from the app. To the customer that is indistinguishable from "drag and
   * drop is broken", and the upload box sits well down the form, so missing
   * it is easy.
   *
   * Listeners are on window and capture-phase so they win regardless of what
   * is under the cursor. A drop carrying no files (dragging selected text, or
   * an image from another tab) is swallowed rather than allowed to navigate.
   */
  useEffect(() => {
    let cancelled = false;

    fetch("/api/artwork-upload")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => {
        if (!cancelled) setDirectUploadEnabled(Boolean(data?.configured));
      })
      .catch(() => {
        // Leave it false. The smaller limit is always safe to advertise.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const allowDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (file) handleArtworkUpload(file);
    };

    window.addEventListener("dragover", allowDrop, true);
    window.addEventListener("drop", onDrop, true);

    return () => {
      window.removeEventListener("dragover", allowDrop, true);
      window.removeEventListener("drop", onDrop, true);
    };
    // handleArtworkUpload is stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Same hazard for reinforcement: it is offered on 13 oz double-sided only,
    // so switching material or turning double-sided off must drop a stale
    // selection. Otherwise the checkbox disappears while the $6/linear-foot
    // charge stays on the quote.
    if (
      next.bannerAddOns.includes(REINFORCEMENT_ADD_ON_KEY) &&
      !allowsReinforcement(next.material, next.doubleSided)
    ) {
      next.bannerAddOns = next.bannerAddOns.filter(
        (key) => key !== REINFORCEMENT_ADD_ON_KEY
      );
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

  /**
   * Signs, per field.
   *
   * Same shape as the sticker rules in lib/validation.ts: this map is the
   * single source, and the summary list below is derived from it so the
   * checklist and the marked boxes can never name different problems.
   */
  function getSignsFieldErrors(): FieldErrors {
    const errors: FieldErrors = {};

    if (!order.customer.customerName.trim()) {
      errors.customerName = "Enter your name.";
    }

    if (!order.customer.email.trim()) {
      errors.customerEmail = "Enter your email.";
    }

    if (!order.artwork.file) {
      errors.artwork = "Upload your artwork before submitting.";
    }

    if (!order.production.needBy.trim()) {
      errors.needBy = "Enter the date you need this in hand.";
    }

    // Only a custom size is typed — every other size resolves from the
    // product's own table, so a blank width there is not a missing answer.
    if (signsQuote.size === CUSTOM_SIZE) {
      if (!(signsQuote.customWidthInches > 0)) {
        errors.width = "Enter a width.";
      }

      if (!(signsQuote.customHeightInches > 0)) {
        errors.height = "Enter a height.";
      }
    }

    return errors;
  }

  function getSignsValidationErrors() {
    const fields = getSignsFieldErrors();
    const errors: string[] = [];

    if (fields.customerName) errors.push(fields.customerName);
    if (fields.customerEmail) errors.push(fields.customerEmail);
    if (fields.artwork) errors.push("Upload your artwork.");
    if (fields.needBy) errors.push(fields.needBy);

    // One sentence for two boxes: the summary reads as prose, the fields get
    // their own short messages.
    if (fields.width || fields.height) {
      errors.push("Enter the width and height for your custom size.");
    }

    return errors;
  }

  function getApparelFieldErrors(): FieldErrors {
    const errors: FieldErrors = {};

    if (!order.customer.customerName.trim()) {
      errors.customerName = "Enter your name.";
    }

    if (!order.customer.email.trim()) {
      errors.customerEmail = "Enter your email.";
    }

    if (!order.production.needBy.trim()) {
      errors.needBy = "Enter the date you need this in hand.";
    }

    // A special order is priced by hand, so the strict menu rules (print
    // locations, matching size breakdown) don't apply — we just need to know
    // what they want.
    if (apparelQuote.specialOrder) {
      if (!apparelQuote.specialOrderNotes.trim()) {
        errors.specialOrderNotes = "Tell us what you need.";
      }

      if (!(apparelQuote.quantity > 0)) {
        errors.quantity = "Enter roughly how many you need.";
      }

      // Artwork is deliberately NOT required here. This is the apparel
      // request flow, and a customer asking what 40 hoodies cost usually has
      // no print-ready file yet — demanding one turns the shop's highest-value
      // enquiry into an upload problem and loses the lead outright. The shop
      // collects artwork in the reply; the quote email already renders "No
      // file uploaded" without complaint.
      return errors;
    }

    if (!order.artwork.file) {
      errors.artwork = "Upload your artwork before submitting.";
    }

    if (apparelQuote.printLocations.length === 0) {
      errors.printLocations = "Choose at least one print location.";
    }

    // The reconciliation error is gone: quantity IS the grid total, so the two
    // cannot disagree. All that remains is asking for at least one shirt.
    if (sizeQuantityTotal < 1) {
      errors.sizeBreakdown = "Add at least one size.";
    }

    return errors;
  }

  function getApparelValidationErrors() {
    const fields = getApparelFieldErrors();
    const errors: string[] = [];

    if (fields.customerName) errors.push("Customer name is required.");
    if (fields.customerEmail) errors.push("Customer email is required.");
    if (fields.artwork) errors.push("Artwork upload is required.");
    if (fields.needBy) errors.push("Needed-in-hand date is required.");

    if (fields.specialOrderNotes) {
      errors.push("Tell us what you need for your special order.");
    }

    if (fields.quantity) errors.push(fields.quantity);

    if (fields.printLocations) errors.push(fields.printLocations);
    if (fields.sizeBreakdown) errors.push("Add how many you need in each size.");

    return errors;
  }

  function getCurrentFieldErrors(): FieldErrors {
    if (isApparelSelected) {
      return getApparelFieldErrors();
    }

    if (isSignsSelected) {
      return getSignsFieldErrors();
    }

    return getOrderFieldErrors(order);
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

  /**
   * Take the customer to the first thing they still have to fix.
   *
   * Runs after the render that marked the fields, which is the only point at
   * which [data-invalid] exists to be found. Document order is the reading
   * order of the form, so the first match is the topmost problem.
   */
  useEffect(() => {
    if (scrollToInvalidToken === 0) return;

    const target = document.querySelector<HTMLElement>('[data-invalid="true"]');
    if (!target) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });

    // Focus the control, not the wrapper, so a keyboard or screen-reader user
    // lands in the box and hears its message rather than being told only that
    // something somewhere is wrong. The file input is skipped deliberately —
    // it is visually hidden, so the upload box's own button is the honest
    // place to land.
    const control = target.querySelector<HTMLElement>(
      "input:not([type='file']), textarea, select, button"
    );

    // preventScroll, or focus would jump the page and undo the smooth scroll.
    control?.focus({ preventScroll: true });
  }, [scrollToInvalidToken]);

  /**
   * Move to a step, recording that it has been seen.
   *
   * Never validates. Steps are orientation, not permission — see StepNav.
   */
  function goToStep(id: StepId) {
    setCurrentStepId(id);
    setVisitedStepIds((seen) => (seen.includes(id) ? seen : [...seen, id]));
    setStepScrollToken((token) => token + 1);
  }

  /**
   * Put the customer at the top of the step they just moved to.
   *
   * Without this, pressing "Continue" from the bottom of a long step leaves
   * the viewport at that scroll position and the new step appears to open
   * halfway down itself.
   *
   * Deliberately keyed on its own token rather than on currentStepId: a
   * failed submit also changes the step, and there the scroll that matters is
   * the one onto the offending field, which the effect above owns.
   */
  useEffect(() => {
    if (stepScrollToken === 0) return;

    const anchor = document.getElementById("order-steps");
    if (!anchor) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    anchor.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [stepScrollToken]);

  /**
   * Tell the shop about a quote that was abandoned after an email was given.
   *
   * Read through a ref rather than closed over, so the listeners below are
   * registered once instead of being torn down and rebuilt on every keystroke
   * in the customer form.
   */
  const leadSnapshotRef = useRef<{
    name: string;
    email: string;
    phone: string;
    company: string;
    flow: string;
    step: StepId;
    summary: string;
    submitted: boolean;
  } | null>(null);

  // Synced in an effect, not written during render: a ref mutated mid-render
  // is not safe under concurrent rendering, where a render can be thrown away
  // after the write. No dependency array on purpose — this must hold the
  // latest values on every commit, and it is a single object assignment.
  useEffect(() => {
    leadSnapshotRef.current = {
      name: order.customer.customerName,
      email: order.customer.email,
      phone: order.customer.phone,
      company: order.customer.company,
      flow: selectedProductId,
      step: currentStepId,
      summary: estimateBar.label,
      submitted: quoteSubmitted,
    };
  });

  // Once per page life. A customer who tabs away and back three times is one
  // lead, not three emails into the shop's inbox.
  const leadSentRef = useRef(false);

  useEffect(() => {
    function reportAbandonedQuote() {
      const snapshot = leadSnapshotRef.current;

      if (!snapshot || leadSentRef.current) return;
      // They finished. The quote itself is the record; a second notice saying
      // they did not finish would be actively wrong.
      if (snapshot.submitted) return;
      // No address means nothing to follow up on.
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(snapshot.email.trim())) return;

      leadSentRef.current = true;

      const payload = JSON.stringify({
        name: snapshot.name,
        email: snapshot.email,
        phone: snapshot.phone,
        company: snapshot.company,
        flow: snapshot.flow,
        step: snapshot.step,
        summary: snapshot.summary,
      });

      // sendBeacon, not fetch: the page is being torn down, and a normal
      // request is cancelled with it. Beacons are queued by the browser and
      // survive the unload, which is the entire point.
      navigator.sendBeacon?.(
        "/api/lead",
        new Blob([payload], { type: "application/json" })
      );
    }

    // pagehide covers real navigation; visibilitychange covers the mobile
    // case that matters most — switching apps, where pagehide may never fire.
    // `unload` is deliberately not used: it suppresses the back/forward cache
    // and is ignored on iOS anyway.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") reportAbandonedQuote();
    }

    window.addEventListener("pagehide", reportAbandonedQuote);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", reportAbandonedQuote);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function submitOrder() {
    const errors = getCurrentValidationErrors();

    setSubmitError(null);

    if (errors.length > 0) {
      // Name what is missing, rather than "complete the missing information".
      // The validator already knows each item; the message threw that away and
      // sent the customer hunting back up a long single-scroll form. The
      // strings are already sentence case, so they read as a list.
      setSubmitError(
        errors.length === 1
          ? errors[0]
          : `${errors.length} things left: ${errors.join(" ")}`
      );

      // Submit lives on the last step, so the thing that is missing is almost
      // never on screen. Move to the step that owns the first problem BEFORE
      // marking the boxes: only the current step is mounted, so marking alone
      // would leave no [data-invalid] in the document for the scroll effect
      // to find, and pressing submit would appear to do nothing at all.
      //
      // Not goToStep() — that bumps the step-scroll token, which would scroll
      // to the top of the step in the same commit the effect below is trying
      // to scroll onto the offending field. Recording the visit by hand keeps
      // the step bar honest without starting that fight.
      const firstBrokenStep = getFirstStepWithError(getCurrentFieldErrors());

      if (firstBrokenStep) {
        setCurrentStepId(firstBrokenStep);
        setVisitedStepIds((seen) =>
          seen.includes(firstBrokenStep) ? seen : [...seen, firstBrokenStep]
        );
      }

      // Mark the individual boxes and take the customer to the first one.
      // The scroll itself cannot happen here: the marks are rendered from
      // state, so no [data-invalid] element exists in the DOM until React has
      // committed this update. The token drives an effect that runs after it.
      setShowFieldErrors(true);
      setScrollToInvalidToken((token) => token + 1);

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

      // Artwork over the platform body limit is deliberately LEFT OUT rather
      // than sent. Sending it gets the whole request killed at the edge with a
      // 413 the server never sees, which used to surface as "Please try again
      // in a moment" — advice that could never work, because the same file
      // failed identically every time. The quote goes through without the
      // attachment and the shop asks for the file directly.
      const artworkFile = order.artwork.file;

      // Preferred path: straight to blob storage, bypassing the function and
      // its body limit entirely. Falls back on its own if no blob store is
      // connected, so the form keeps working either way.
      const blobUrl = artworkFile
        ? await uploadArtworkToBlob(artworkFile, setUploadProgress)
        : null;

      setUploadProgress(null);

      // The proof the customer just approved, rendered to a PNG so the email
      // carries it alongside their raw art. Stickers only — it is the only
      // flow with a preview to prove. Small by construction (~1000px), so it
      // rides inline without troubling the body limit.
      const isStickers = !isSignsSelected && !isApparelSelected;
      // Falls back to the preset label, which is a square, when the customer
      // used a size button instead of typing dimensions.
      const presetInches = parseSizeInches(order.product.size);

      const proof =
        isStickers && artworkPreview
          ? await renderStickerProof({
              artworkUrl: artworkPreview,
              shape: order.product.shape,
              material: order.product.material,
              finish: order.product.finish,
              sizeLabel: order.product.size,
              quantity: order.product.quantity,
              widthInches: order.product.widthInches || presetInches,
              heightInches: order.product.heightInches || presetInches,
              artScale: order.product.artScale,
              artMargin: order.product.artMargin,
              magentaCutLine: order.product.magentaCutLine,
            })
          : null;

      if (proof) {
        formData.append("proof", proof, "gorilla-proof.png");
      }

      const artworkOversized = isArtworkTooLargeToAttach(artworkFile);

      if (blobUrl) {
        formData.append("artworkUrl", blobUrl);
        formData.append("artworkFileName", artworkFile!.name);
        formData.append("artworkFileSize", String(artworkFile!.size));
      } else if (artworkFile && !artworkOversized) {
        formData.append("artwork", artworkFile, artworkFile.name);
      } else if (artworkFile) {
        formData.append("artworkTooLarge", "true");
        formData.append("artworkFileName", artworkFile.name);
        formData.append("artworkFileSize", String(artworkFile.size));
      }

      const response = await fetch("/api/quote", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // 413 is the platform, not the app: the body never reached the route.
        // Say so plainly instead of suggesting a retry that cannot succeed.
        if (response.status === 413) {
          throw new Error("PAYLOAD_TOO_LARGE");
        }

        // 502 means the route ran but neither the email nor Printavo took the
        // quote. It carries a quote number, which the customer should keep.
        if (response.status === 502) {
          const failed = await response.json().catch(() => null);
          throw new Error(
            failed?.quoteNumber
              ? `UNDELIVERED:${failed.quoteNumber}`
              : "UNDELIVERED:"
          );
        }

        throw new Error("Server returned an error.");
      }

      const result = await response.json();

      console.log("QUOTE RESPONSE");
      console.log(result);

      // Belt and braces. The route now 502s when nothing landed, but it also
      // reports per-channel status, and claiming success while the quote sat
      // in nobody's inbox is the exact failure this guards against.
      if (result?.notification && result?.printavo) {
        const reachedShop =
          Boolean(result.notification.sent) || Boolean(result.printavo.created);

        if (!reachedShop) {
          throw new Error(`UNDELIVERED:${result.quoteNumber || ""}`);
        }
      }

      setQuoteConfirmation({
        quoteNumber: result.quoteNumber,
        receivedAt: result.receivedAt,
        message: result.message,
        // Stickers only, and null whenever Printavo was unreachable.
        checkout: result.checkout ?? null,
      });

      setSubmittedProductId(selectedProductId);
      setQuoteSubmitted(true);
    } catch (error) {
      console.error(error);

      if (error instanceof Error && error.message.startsWith("UNDELIVERED:")) {
        const reference = error.message.slice("UNDELIVERED:".length);

        setSubmitError(
          `We could not deliver your request${
            reference ? ` (reference ${reference})` : ""
          }. Nothing was sent to the shop. Use "Copy Quote Details" below and email or call Gorilla Salem directly — please do not assume this went through.`
        );
      } else if (
        error instanceof Error &&
        error.message === "PAYLOAD_TOO_LARGE"
      ) {
        setSubmitError(
          `Your artwork is too large to send through this form (the limit is ${MAX_ATTACHED_ARTWORK_LABEL}). ` +
            "Remove the file and submit the quote without it — we'll email you to collect the artwork."
        );
      } else {
        setSubmitError(
          "Unable to submit your quote right now. Please try again in a moment."
        );
      }
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
    setShowFieldErrors(false);
    setCopyStatus("idle");
    setCurrentStepId("product");
    setVisitedStepIds(["product"]);
    setStepScrollToken(0);
    // A fresh quote is a fresh chance to abandon one.
    leadSentRef.current = false;
  }

  // Price per sticker, excluding shipping — shipping is shown as its own line.
  // Guarded, because quantity is no longer clamped in state — an empty box is
  // genuinely 0 now, and dividing by it renders "$Infinity each".
  const unitPrice =
    order.pricing.stickerPrice / Math.max(1, order.product.quantity);
  const currentValidationErrors = getCurrentValidationErrors();
  // Every flow now routes through getCurrentValidationErrors(), which returns
  // the sticker rules for stickers, so one check covers all three.
  const readyToSubmit = currentValidationErrors.length === 0;

  // Recomputed from live state every render, so a field stops being marked the
  // moment it becomes valid — fixing one box does not require another submit
  // to find out it was accepted.
  const liveFieldErrors = getCurrentFieldErrors();
  const fieldErrors: FieldErrors = showFieldErrors ? liveFieldErrors : {};

  // The step bar reads the LIVE errors, not the marked ones. Marking is gated
  // on a submit attempt so nobody is met with red before they have typed
  // anything, but completion is a fact about the order and is true either
  // way — a step must stop claiming to be done the moment a box is emptied.
  const errorStepIds = getStepsWithErrors(liveFieldErrors);

  const step = getStep(currentStepId);
  const flowLabel = isApparelRequest
    ? "Quoted by hand"
    : isApparelSelected
    ? "Manual quote"
    : isSignsSelected
    ? "Quote request"
    : "Sticker estimate";

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

  // The live proof and the running summary are reference, not a step: they
  // stay pinned beside every step that can change them. Built once here rather
  // than inline, because the review step needs the same two cards in a
  // different column and duplicating the three-way flow ternary is how the
  // two copies drift apart.
  const previewCard = isSignsSelected ? (
    <SignsPreviewCard artworkPreview={artworkPreview} signsQuote={signsQuote} />
  ) : isApparelRequest ? (
    // ApparelPreview draws a garment mock from the S&S colour and image. On a
    // hand-quote request none of that has been chosen, so it would be drawing
    // a shirt nobody specified. Show the file they actually sent instead.
    <div className="border border-[var(--rule)] bg-[var(--paper)] p-6">
      <p className="eyebrow">Your request</p>

      <h3 className="mt-2 text-head font-bold tracking-display">
        {apparelQuote.quantity > 0
          ? `${apparelQuote.quantity} × ${apparelQuote.garmentType}`
          : apparelQuote.garmentType}
      </h3>

      {artworkPreview ? (
        <img
          src={artworkPreview}
          alt="Your uploaded artwork"
          className="mt-5 max-h-64 w-full border border-[var(--rule)] bg-[var(--shirt-blank)] object-contain p-4"
        />
      ) : (
        <p className="mt-5 border border-[var(--rule)] border-l-4 border-l-[var(--rule)] bg-[var(--shirt-blank)] p-4 text-fine font-bold text-[var(--ink-muted)]">
          No artwork yet — that is fine for apparel. Send the request and we
          will sort the file out together.
        </p>
      )}
    </div>
  ) : isApparelSelected ? (
    <ApparelPreview
      artworkPreview={artworkPreview}
      garmentType={selectedGarmentLabel}
      garmentColor={selectedSsColor?.colorName || apparelQuote.garmentColor}
      garmentImage={selectedGarmentImage}
      garmentColorHex={selectedSsColor?.colorHex}
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
  );

  const summaryCard = isSignsSelected ? (
    <SignsSummaryCard
      signsQuote={signsQuote}
      production={order.production}
      pricing={signsPricing}
    />
  ) : isApparelRequest ? (
    // ApparelSummaryCard is a price breakdown. There is no price here, and a
    // breakdown of zeros reads as a bug rather than as "we'll tell you".
    <div className="border border-[var(--rule)] bg-[var(--paper)] p-6">
      <p className="eyebrow">What we&rsquo;ll quote</p>

      <dl className="mt-4 space-y-3 text-fine">
        <div className="flex justify-between gap-4 border-b border-[var(--rule)] pb-3">
          <dt className="font-bold text-[var(--ink-muted)]">Garment</dt>
          <dd className="font-bold text-[var(--ink-black)]">
            {apparelQuote.garmentType}
          </dd>
        </div>

        <div className="flex justify-between gap-4 border-b border-[var(--rule)] pb-3">
          <dt className="font-bold text-[var(--ink-muted)]">Roughly</dt>
          <dd className="spec font-bold text-[var(--ink-black)]">
            {apparelQuote.quantity > 0 ? apparelQuote.quantity : "—"}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="font-bold text-[var(--ink-muted)]">Price</dt>
          <dd className="font-bold text-[var(--ink-black)]">Quoted by hand</dd>
        </div>
      </dl>

      {apparelQuote.specialOrderNotes.trim() && (
        <p className="mt-4 whitespace-pre-wrap border-t border-[var(--rule)] pt-4 text-fine text-[var(--ink-muted)]">
          {apparelQuote.specialOrderNotes}
        </p>
      )}
    </div>
  ) : isApparelSelected ? (
    <ApparelSummaryCard
      apparelQuote={apparelQuote}
      selectedSsSize={selectedSsSize}
      apparelPricing={apparelPricing}
      artworkAnalysis={artworkAnalysis}
    />
  ) : (
    <OrderSummary order={order} />
  );

  const stepHeading = (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{step.label}</p>

        <h2 className="mt-2 text-head font-bold tracking-display text-[var(--ink-black)]">
          {currentStepId === "details"
            ? isApparelRequest
              ? "What do you need printed?"
              : isApparelSelected
              ? "Build your apparel quote"
              : isSignsSelected
              ? "Build your signs quote"
              : "Choose your sticker details"
            : step.title}
        </h2>

        <p className="mt-2 max-w-xl text-fine text-[var(--ink-muted)]">
          {/* The stock details blurb promises size options, which the apparel
              request flow does not collect. Naming fields that are not on the
              screen is how a form starts feeling broken. */}
          {currentStepId === "details" && isApparelRequest
            ? "Enough for us to price it by hand, and when you need it."
            : step.blurb}
        </p>
      </div>

      {currentStepId !== "product" && (
        <div className="spec shrink-0 border border-[var(--rule)] bg-[var(--paper)] px-4 py-2 text-spec text-[var(--ink-muted)]">
          {flowLabel}
        </div>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        {/* The masthead belongs to the decision to start, not to the work.
            Once a customer is building, it is a screen of marketing between
            them and the step they are on. */}
        {currentStepId === "product" && (
        <div className="mb-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--rush-red)]">
            Printed Locally in Salem, MA
          </p>

          <h1 className="mt-3 max-w-4xl text-display font-bold tracking-display text-[var(--ink-black)] sm:text-display lg:text-display">
            Custom print quotes made simple.
          </h1>

          <p className="mt-5 max-w-2xl text-lede leading-8 text-[var(--ink-muted)]">
            Choose your details, upload your artwork, and get a live estimate or
            quote request before sending it to Gorilla Salem.
          </p>

          {/* The shop closes quotes fastest by phone, and the number was only
              in the footer — the bottom of what used to be an eight-screen
              scroll. Offered here, next to the decision to start. */}
          <p className="mt-4 text-body font-bold text-[var(--ink-black)]">
            Prefer to call?{" "}
            <a
              className="underline decoration-1 underline-offset-2 transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)]"
              href="tel:+19787457755"
            >
              (978) 745-7755
            </a>
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className=" bg-white px-4 py-2 text-sm font-bold text-[var(--gorilla-green)]">
              Hand-printed locally
            </span>
            <span className=" bg-white px-4 py-2 text-sm font-bold text-[var(--gorilla-green)]">
              Salem, Massachusetts
            </span>
            <span className=" bg-white px-4 py-2 text-sm font-bold text-[var(--gorilla-green)]">
              Real proof review before production
            </span>
          </div>
        </div>
        )}

        {/* Scroll target for step changes. Above the estimate stub in document
            order, so landing here never puts the sticky bar over the heading. */}
        <div id="order-steps" className="scroll-mt-4">
          <StepNav
            currentStepId={currentStepId}
            visitedStepIds={visitedStepIds}
            errorStepIds={errorStepIds}
            showProblems={showFieldErrors}
            onSelect={goToStep}
          />
        </div>

        {/* Rendered ONCE, outside the flow ternaries and outside the grid, so
            it spans the page and pins on both breakpoints. Reads values that
            are already computed — it adds no pricing logic.

            Held back on the product step: there is nothing configured yet, so
            it would be quoting a default nobody chose. */}
        {currentStepId !== "product" && (
          <EstimateBar
            label={estimateBar.label}
            total={estimateBar.total}
            priceable={estimateBar.priceable}
            detail={estimateBar.detail}
          />
        )}

        {currentStepId === "product" && (
        <section className="border border-[var(--rule)] bg-white p-5 sm:p-8">
          {stepHeading}

          <div className="grid gap-4 md:grid-cols-3">
            {productCategories.map((product) => {
              // "request" is selectable — it just has no online price.
              const isActive = product.status !== "coming-soon";
              const isSelected = selectedProductId === product.id;

              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={!isActive}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    updateProduct({ type: product.title });

                    // Apparel is a hand-quote request, not the configurator.
                    // Pinning specialOrder here routes it down the path that
                    // already exists for "priced by hand": no online estimate,
                    // quoteRequired on the payload, and — because that payload
                    // carries garmentType and supplier — never classified as a
                    // sticker order, which is the only flow that self-bills.
                    if (product.status === "request") {
                      setApparelQuote((current) => ({
                        ...current,
                        specialOrder: true,
                      }));
                    }
                    // Errors belong to the flow that produced them. Without
                    // this, failing submit on stickers and then switching to
                    // signs carried the red marks across to a form the
                    // customer had not tried to submit yet.
                    setShowFieldErrors(false);
                  }}
                  className={` border p-5 text-left transition ${
                    isSelected
                      ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                      : isActive
                      ? "cursor-pointer border-[var(--rule)] bg-white hover:-translate-y-0.5"
                      : "cursor-not-allowed border-[var(--rule)] bg-[var(--shirt-blank)] opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-bold text-[var(--ink-black)]">
                      {product.title}
                    </p>

                    {product.badge && (
                      <span
                        className={` px-3 py-1 text-xs font-bold ${
                          isSelected
                            ? "bg-[var(--gorilla-green)] text-white"
                            : "bg-[var(--shirt-blank)] text-[var(--ink-muted)]"
                        }`}
                      >
                        {product.badge}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-muted)]">
                    {product.description}
                  </p>

                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[var(--rush-red)]">
                    {product.status === "active"
                      ? "Available now"
                      : product.status === "request"
                      ? "Quoted by hand"
                      : "Coming soon"}
                  </p>
                </button>
              );
            })}
          </div>

          {/* The "not sure what to choose" reassurance also sits beside the
              price, but the hesitation it answers starts HERE — choosing
              between stickers, apparel and signs — not partway through a
              configurator the customer has already committed to. Splitting the
              form into steps took the aside off this screen entirely, so
              without this the product step lost it altogether. */}
          <p className="mt-6 border border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)] bg-[var(--surface-ok)] p-4 text-fine font-bold text-[var(--gorilla-green-dark)]">
            Not sure which one you need? Pick the closest and send it anyway.
            Gorilla Salem will confirm the best setup before anything prints.
          </p>

          <StepFooter currentStepId={currentStepId} onNavigate={goToStep} />
        </section>
        )}

        {currentStepId !== "product" && currentStepId !== "review" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section className=" border border-[var(--rule)] bg-white p-5 sm:p-8 lg:col-span-7">
            {stepHeading}

            <div className="space-y-8">
              {currentStepId === "details" && (
              <>
              {isSignsSelected ? (
                <SignsBuilder
                  signsQuote={signsQuote}
                  deliveryMethod={order.production.deliveryMethod}
                  fieldErrors={fieldErrors}
                  onUpdate={(updates) => updateSignsQuote(updates)}
                  onSelectProduct={handleSignProductSelect}
                  onSelectDeliveryMethod={(deliveryMethod) =>
                    updateProduction({ deliveryMethod })
                  }
                />
              ) : isApparelRequest ? (
                // The full ApparelBuilder is deliberately not rendered. See
                // ApparelRequestBuilder — its pricing is not signed off, and
                // showing an unbacked number is worse than showing none.
                <ApparelRequestBuilder
                  garmentType={apparelQuote.garmentType}
                  quantity={apparelQuote.quantity}
                  notes={apparelQuote.specialOrderNotes}
                  fieldErrors={fieldErrors}
                  onUpdate={(updates) => updateApparelQuote(updates)}
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
                  fieldErrors={fieldErrors}
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
                  fieldErrors={fieldErrors}
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

              <NeedByDate
                needBy={order.production.needBy}
                deadlineType={order.production.deadlineType}
                onNeedByChange={(needBy) => updateProduction({ needBy })}
                onDeadlineTypeChange={(deadlineType) =>
                  updateProduction({
                    deadlineType: deadlineType as "Firm" | "Flexible",
                  })
                }
                error={fieldErrors.needBy}
              />
              </>
              )}

              {currentStepId === "artwork" && (
              <>
              <UploadBox
                onFileSelected={handleArtworkUpload}
                // Without these the box can never show that a file arrived,
                // which made a working drop look like a failed one.
                fileName={order.artwork.file?.name || null}
                fileSizeBytes={order.artwork.file?.size ?? null}
                directUploadEnabled={directUploadEnabled}
                previewUrl={artworkPreview}
                error={fieldErrors.artwork}
              />

              <ArtworkGuidance directUploadEnabled={directUploadEnabled} />
              </>
              )}

              {currentStepId === "contact" && (
              <CustomerForm
                customerName={order.customer.customerName}
                company={order.customer.company}
                email={order.customer.email}
                phone={order.customer.phone}
                notes={order.customer.notes}
                onChange={(updates) => updateCustomer(updates)}
                errors={{
                  customerName: fieldErrors.customerName,
                  email: fieldErrors.customerEmail,
                }}
              />
              )}
            </div>

            <StepFooter currentStepId={currentStepId} onNavigate={goToStep} />
          </section>

          <aside className="space-y-6 lg:col-span-5">
            {previewCard}

            <div className=" border border-[var(--rule)] bg-white p-5 text-sm font-bold leading-6 text-[var(--ink-muted)] sm:p-6">
              Not sure what to choose? Send the quote anyway. Gorilla Salem will
              review the artwork and help confirm the best setup before anything
              goes to print.
            </div>

            {summaryCard}
          </aside>
        </div>
        )}

        {currentStepId === "review" && (
        <div>
          {stepHeading}

          {/* The review step is the one place the aside is not an aside. On
              phones the two columns stack in document order, so keeping the
              submit button in a right-hand rail would put it ABOVE the proof
              and the price it is meant to confirm. What you are buying comes
              first; what you can still change, then send, comes second. */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              {previewCard}
              {summaryCard}
            </div>

            <div className="space-y-6 lg:col-span-5">
            {/* Rendered once, outside the three-way flow ternary, so
                stickers / signs / apparel all get it from one place. It sits
                after the price on both breakpoints — an add-on is a decision
                you make once you know what the order already costs. */}
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
                <p className="eyebrow">
                  Required Info
                </p>

                {currentValidationErrors.length === 0 ? (
                  <p className="mt-4 bg-[var(--surface-ok)] p-4 text-sm font-bold text-[var(--gorilla-green)]">
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
                <p
                  // Announced, not just seen — the field marks are up the page
                  // and a screen-reader user is standing at the button.
                  role="alert"
                  className="mb-3 bg-[var(--surface-rush)] p-4 text-sm font-bold leading-6 text-[var(--rush-red)]"
                >
                  {submitError}
                </p>
              )}
              {readyToSubmit ? (
                <SubmitButton
                  onSubmit={submitOrder}
                  isLoading={isSubmitting}
                  uploadProgress={uploadProgress}
                />
              ) : (
                // Pressable, not disabled. A disabled button is a dead end on a
                // form this long: it refuses without saying which box is empty,
                // and submitOrder — the only thing that marks the fields and
                // scrolls to the first one — could never run, so the marking
                // below would be unreachable code. Pressing this fails
                // validation and returns immediately; nothing is ever sent.
                //
                // Inverted ink rather than the 40% disabled treatment, because
                // white on 40% RUSH RED does not hold 4.5:1 and this is now a
                // real target the customer is meant to hit.
                <button
                  type="button"
                  onClick={submitOrder}
                  className="w-full cursor-pointer border-2 border-[var(--rush-red)] bg-[var(--paper)] py-5 text-lede font-bold text-[var(--rush-red)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--surface-rush)] active:translate-x-[2px] active:translate-y-[2px]"
                >
                  Show what&rsquo;s missing
                </button>
              )}
            </div>

            <StepFooter currentStepId={currentStepId} onNavigate={goToStep} />
            </div>
          </div>
        </div>
        )}

        <footer className="mt-12 border border-[var(--rule)] bg-white p-6 text-center">
          <p className="eyebrow">
            Gorilla Salem
          </p>
          <p className="mt-2 text-lg font-bold text-[var(--ink-black)]">
            Custom printing, local service, real people reviewing your order.
          </p>
          {/* The shop closes quotes fastest by phone, and until now the only
              contact route on the page was email. tel: so a phone taps to
              dial; both are real links rather than plain text. */}
          <p className="mt-2 text-sm font-bold text-[var(--ink-muted)]">
            Salem, Massachusetts •{" "}
            <a
              className="underline decoration-1 underline-offset-2 transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)]"
              href="tel:+19787457755"
            >
              (978) 745-7755
            </a>{" "}
            •{" "}
            <a
              className="underline decoration-1 underline-offset-2 transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)]"
              href="mailto:quote@gorillasalem.com"
            >
              quote@gorillasalem.com
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
