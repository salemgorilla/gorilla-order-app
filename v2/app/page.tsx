"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SALES_TAX, getSignsTotals, getStickerTotals } from "../lib/tax";
import { looksLikeEmailAddress } from "../lib/email-address";

import Header from "../components/Header";
import StepNav from "../components/StepNav";
import DesignCard from "../components/DesignCard";
import TemplateDesigner from "../components/TemplateDesigner";
import StepFooter from "../components/StepFooter";
import UploadBox from "../components/upload/UploadBox";
import { useKiosk } from "../components/kiosk/KioskProvider";
import {
  forgetCustomer,
  getCustomerServerSnapshot,
  getCustomerSnapshot,
  rememberCustomer,
  subscribeCustomer,
} from "../components/customerStore";
import {
  applyRememberedContact,
  shouldOfferRememberedContact,
  toRememberedContact,
} from "../lib/remembered-contact";
import BackgroundRemovalControl from "../components/upload/BackgroundRemovalControl";
import ArtworkHandoff from "../components/kiosk/ArtworkHandoff";
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
  createSignsQuote,
  getFinishingOptions,
  getSignProduct,
  getSignSizeLabel,
  getSizeOptions,
  createSignsDesign,
  type SignsDesign,
} from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { signsPricingConfig } from "../lib/signs-pricing-config";
import { productCategories, type ProductCategory } from "../lib/products";
import {
  getTemplate,
  getTemplateTextErrors,
} from "../lib/templates";
import { reviews } from "../lib/reviews";
import { createStickerItem, defaultOrder } from "../lib/order";
import { AddOnOffer, toAddOn } from "../lib/addons";
import {
  describeStickerSize,
  getStickerMaterialPrice,
  quoteStickerCart,
  STICKER_SETUP_FEE,
  STICKER_SETUP_FEE_ADDITIONAL,
} from "../lib/pricing";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { apparelCatalogStyles } from "../lib/apparel-catalog";
import {
  getItemFieldErrors,
  getOrderFieldErrors,
  getApparelFieldErrors as getApparelFieldErrorsFor,
  getSignsFieldErrors as getSignsFieldErrorsFor,
  getSignsDesignFieldErrors,
  getSignsValidationSummary,
  getOrderValidationErrors,
  type FieldErrors,
  type ItemFieldErrors,
} from "../lib/validation";
import {
  getFirstStepWithError,
  getStep,
  getStepsWithErrors,
  type StepId,
} from "../lib/steps";
import { analyzeArtworkFile, ArtworkAnalysis } from "../lib/artwork";
import {
  collectKnockoutCandidates,
  planKnockouts,
} from "../lib/attachment-plan";
import {
  isArtworkTooLargeToAttach,
  MAX_ATTACHED_ARTWORK_LABEL,
  MAX_INLINE_ARTWORK_TOTAL_BYTES,
  remainingInlineBudget,
} from "../lib/upload-limits";
import { uploadArtworkToBlob } from "../lib/artwork-upload";
import { renderStickerProof } from "../lib/sticker-proof";
import {
  isRemovalFailure,
  removeBackground,
  type BackgroundRemovalResult,
} from "../lib/background-removal";
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
import SignsDelivery from "../features/signs/SignsDelivery";
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
  /**
   * Kiosk mode. Defaults to "off" on the public website, so every behaviour
   * below reads as it always has unless this page is being served on the
   * machine in the shop. See lib/kiosk.ts for what changes and why.
   */
  const kiosk = useKiosk();

  /**
   * The contact details this browser remembers from a previous order.
   *
   * Read through an external store so the server renders "nothing" honestly
   * and the client has the real answer before paint — see
   * components/customerStore.ts.
   *
   * OFF AT THE KIOSK, and gated on `kiosk.enabled`, which is the same signal
   * every other kiosk behaviour reads. There is deliberately no second way of
   * knowing: a shared terminal showing the previous customer's name and
   * address to whoever walks up next is the exact failure kiosk mode exists to
   * prevent, and a prefill would survive the remount that throws the rest of
   * the state away.
   */
  const rememberedContact = useSyncExternalStore(
    subscribeCustomer,
    getCustomerSnapshot,
    getCustomerServerSnapshot
  );

  const offerRemembered = shouldOfferRememberedContact({
    isKiosk: kiosk.enabled,
    contact: rememberedContact,
  });

  // Applied once, and never over anything already typed. Somebody who has
  // started filling the form in is telling us something more recent than
  // storage is.
  const [rememberedApplied, setRememberedApplied] = useState(false);


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
  /**
   * The newsletter box ships pre-ticked on the website — defensible when the
   * person ticking it owns the address. On a kiosk it is not: in staff mode
   * somebody is typing on a customer's behalf, and in self-service a default
   * carried in from the shop is not a choice the customer made. Consent has to
   * be an action here, so a kiosk session starts unticked.
   *
   * Done in the initial state rather than an effect, so there is never a first
   * render in which the box is ticked.
   */
  const [order, setOrder] = useState(() =>
    kiosk.enabled
      ? {
          ...defaultOrder,
          customer: { ...defaultOrder.customer, newsletterOptIn: false },
        }
      : defaultOrder
  );

  const [apparelQuoteState, setApparelQuoteState] = useState(defaultApparelQuote);
  // Lazy, so the first quote gets its own design rather than sharing the
  // module constant's identity with anything else on the page.
  const [signsQuote, setSignsQuote] = useState(createSignsQuote);
  const [ssProducts, setSsProducts] = useState<SsCatalogProduct[]>([]);
  const [selectedSsProductId, setSelectedSsProductId] = useState("");
  const [selectedSsColorName, setSelectedSsColorName] = useState("");
  const [selectedSsSizeName, setSelectedSsSizeName] = useState("");
  const [selectedApparelCategory, setSelectedApparelCategory] = useState("All");
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({});
  const [ssCatalogStatus, setSsCatalogStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  // Signs and apparel are single-file flows and keep the singular slots.
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  // Stickers are a cart, so preview and analysis are per design, keyed by
  // item id. Not by index — removing a middle design would re-point every
  // later preview at the wrong artwork.
  const [itemPreviews, setItemPreviews] = useState<Record<string, string>>({});
  // Signs are a cart now too, so their previews are per design and keyed by
  // design id for the same reason — removing a middle design must not
  // re-point every later preview at the wrong artwork.
  const [signsDesignPreviews, setSignsDesignPreviews] = useState<
    Record<string, string>
  >({});
  const [itemAnalyses, setItemAnalyses] = useState<
    Record<string, ArtworkAnalysis | null>
  >({});
  /**
   * Background knocked out of a design's artwork, when the customer asked for
   * it. Keyed by design, and kept ALONGSIDE the original rather than replacing
   * it: unticking the box has to give them their file back untouched, and the
   * shop is sent both either way.
   */
  const [itemKnockouts, setItemKnockouts] = useState<
    Record<string, BackgroundRemovalResult>
  >({});
  /** Why a knockout could not be done, per design. */
  const [itemKnockoutErrors, setItemKnockoutErrors] = useState<
    Record<string, string>
  >({});
  /**
   * The customer's INTENT, tracked separately from the result.
   *
   * The checkbox is controlled, and the removal takes a moment. Binding the
   * box to the finished knockout meant ticking it appeared to do nothing until
   * the work landed — a control that ignores you is a broken control. This
   * flips immediately; the knockout catches up, and on failure this goes back
   * to false so the box never claims something we did not do.
   */
  const [knockoutWanted, setKnockoutWanted] = useState<Record<string, boolean>>(
    {}
  );
  const [knockoutBusyId, setKnockoutBusyId] = useState<string | null>(null);
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
    apparelQuoteState.garmentType;

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

  /**
   * The apparel quote as everything downstream should see it.
   *
   * Quantity is DERIVED from the size grid, never entered separately. Typing
   * M=4 L=6 2XL=2 is the order; there is no second number to disagree with it.
   * That is what removed this flow's only failure state — "Size breakdown must
   * total 24, current total is 22" — a reconciliation error the customer had
   * to solve because the form asked the same question twice.
   *
   * ── WHY THIS IS DERIVED AND NOT SYNCED ────────────────────────────────────
   * This used to be a useEffect that wrote sizeQuantityTotal back onto the
   * quote. That works, but it makes the total true only AFTER a render has
   * already been painted with the old one — and the two readerships had
   * drifted apart in exactly that gap: validation read sizeQuantityTotal
   * directly, while pricing, the Printavo push and the shop email all read
   * the synced copy. They agreed only because the effect kept them agreeing.
   *
   * Computing it during render removes the gap rather than narrowing it.
   * There is no frame in which a reader can see a stale quantity, because
   * there is no longer a second copy to be stale.
   *
   * Readers are deliberately untouched: they still say `apparelQuote`, and
   * still get the same number they got before in steady state. Writers go to
   * `setApparelQuoteState`, which holds everything the customer actually
   * typed.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const apparelQuote = useMemo(() => {
    // The apparel REQUEST flow has no size grid — the customer types a rough
    // count — so the grid total must not touch it. Letting it through drove
    // that number straight back to the empty grid's 0, and the form then
    // complained "enter roughly how many you need" about a box the customer
    // had just filled in, with no way to clear it.
    if (isApparelRequest) return apparelQuoteState;

    return apparelQuoteState.quantity === sizeQuantityTotal
      ? // Same object when nothing changed, so memo consumers downstream do
        // not see a new reference every render.
        apparelQuoteState
      : { ...apparelQuoteState, quantity: sizeQuantityTotal };
  }, [apparelQuoteState, isApparelRequest, sizeQuantityTotal]);

  const sizeBreakdownFromButtons = useMemo(() => {
    return Object.entries(sizeQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([size, quantity]) => `${size}-${quantity}`)
      .join(", ");
  }, [sizeQuantities]);

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

  // One quote, however many designs are in it. The $15 setup is per design,
  // so quoteSignsCart is a sum rather than a second pricing engine — see
  // lib/signs-cart.ts.
  const signsPricing = useMemo(
    () => quoteSignsCart(signsQuote.designs),
    [signsQuote]
  );

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
      const designs = signsQuote.designs;
      const product = getSignProduct(designs[0].productId);

      return {
        label:
          designs.length > 1
            ? `${designs.length} designs · ${signsPricing.quantity} signs`
            : `${designs[0].quantity} × ${product.label}`,
        // Tax-inclusive. Signs carry no shipping component, so the whole
        // total is taxable — see getSignsTotals.
        total: signsPricing.priceable
          ? getSignsTotals(signsPricing).estimatedTotal
          : 0,
        priceable: signsPricing.priceable,
        detail: signsPricing.priceable
          ? designs.length > 1
            ? `Setup $${(
                signsPricingConfig.setupFee * designs.length
              ).toFixed(2)} across ${designs.length} designs`
            : `${getSignSizeLabel(designs[0])} · $${signsPricing.unitPrice.toFixed(
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

    const designs = order.items.length;
    const totalStickers = order.items.reduce(
      (sum, item) => sum + Math.max(0, item.quantity),
      0
    );

    // With one design the stub reads exactly as it always did. With several,
    // a per-sticker price across different sizes would be an average of
    // unlike things, so it names the cart instead of inventing a unit price.
    if (designs > 1) {
      return {
        label: `${designs} designs · ${totalStickers.toLocaleString()} stickers`,
        total: getStickerTotals(order.pricing).estimatedTotal,
        priceable: true,
        detail: `Setup $${order.pricing.setupPrice.toFixed(2)} across ${designs} designs`,
      };
    }

    const first = order.items[0];

    return {
      label: `${first.quantity} × ${describeStickerSize(first.size, {
        widthInches: first.widthInches,
        heightInches: first.heightInches,
      })} ${first.shape} stickers`,
      total: getStickerTotals(order.pricing).estimatedTotal,
      priceable: true,
      detail: `$${(
        (order.pricing.stickerPrice + order.pricing.setupPrice) /
        Math.max(1, first.quantity)
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
    order.items,
    order.pricing,
  ]);

  useEffect(() => {
    async function loadSsCatalog() {
      setSsCatalogStatus("loading");

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
          setApparelQuoteState((current) => ({
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
        // Status only. The raw upstream message is logged above and reported
        // by /api/health; it must never reach the customer-facing panel, which
        // used to render it verbatim.
        setSsCatalogStatus("error");
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

    setApparelQuoteState((current) => ({
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

      setApparelQuoteState((quote) => ({
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

      setApparelQuoteState((quote) => ({
        ...quote,
        sizeBreakdown: nextBreakdown,
      }));

      return next;
    });
  }

  function resetSizeBreakdown() {
    setSizeQuantities({});
    setApparelQuoteState((current) => ({
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

    setApparelQuoteState((current) => ({
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

  /**
   * Normalise one design and return it plus its material cost.
   *
   * Sanitising happens here rather than only in the input's blur handler.
   * Not a constraint on size — any dimension is allowed. It exists because
   * whatever is in state goes straight to the price, the payload and the
   * shop's cut spec, so normalising at the single point where price is
   * computed keeps the number shown, the number charged and the size cut
   * identical, and keeps float noise like 1.7500000000000002 out of the order.
   */
  function priceStickerItem(item: (typeof order.items)[number]) {
    const finish = getDecalFinishFromMaterial(item.material);

    const widthInches = sanitizeSizeInches(item.widthInches);
    const heightInches = sanitizeSizeInches(item.heightInches);

    // Quantity is NOT clamped into state — only into the price.
    //
    // snapQuantity is Math.max(1, ...), and running it on state meant an empty
    // quantity box silently became 1. The validation rule for quantity could
    // therefore never fire, so a customer who cleared the field saw no
    // complaint and a quiet "1 x 3\" stickers: $25.29" estimate. Keeping the
    // real value in state is what lets the field mark itself as missing and
    // block submit; the price still uses the snapped figure, so no quote's
    // number changes.
    const quantityForPricing = snapQuantity(item.quantity);

    // Keep the label in step with the dimensions. Everything that shows a size
    // to the customer or to the shop — the review card, the proof card, the
    // quote email, the Printavo line — reads `size`, and nothing had updated
    // it since the size buttons were replaced by typed dimensions.
    const size =
      widthInches > 0 && heightInches > 0
        ? formatSizeLabel(widthInches, heightInches)
        : item.size;

    return {
      item: { ...item, finish, widthInches, heightInches, size },
      // Material only. Setup is charged once per CART, not per design — see
      // getCartSetupFee — so it cannot be folded in here.
      materialPrice: getStickerMaterialPrice(
        quantityForPricing,
        item.material,
        item.size,
        { widthInches, heightInches }
      ),
    };
  }

  function recalculateOrder(nextOrder: typeof order) {
    const priced = nextOrder.items.map(priceStickerItem);

    // The same call the SERVER makes in repriceStickers. Adding these up was
    // written out in both places; the browser showing one total while the
    // server bills another is the failure that costs money, so there is now
    // one composition — see quoteStickerCart in lib/pricing.ts.
    const pricing = quoteStickerCart({
      materialPrices: priced.map((entry) => entry.materialPrice),
      deliveryMethod: nextOrder.production.deliveryMethod,
    });

    return {
      ...nextOrder,
      items: priced.map((entry) => entry.item),
      pricing: { ...nextOrder.pricing, ...pricing },
    };
  }

  /**
   * Add a design to the cart.
   *
   * Priced immediately through recalculateOrder, so the estimate stub moves
   * the moment the design appears — a customer adding a second design should
   * see the $12.50 land, not discover it at review.
   */
  function addDesign() {
    setOrder(
      recalculateOrder({
        ...order,
        items: [...order.items, createStickerItem()],
      })
    );
  }

  function removeDesign(itemId: string) {
    // Never remove the last one. An empty cart has no price, no proof and no
    // way back, and the customer would be looking at a form with nothing in it.
    if (order.items.length <= 1) return;

    // Revoke this design's preview. Removing the item drops the only reference
    // to the object URL, so without this the blob is pinned for the life of
    // the page. (CART-PLAN bug 2.)
    const preview = itemPreviews[itemId];
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    // Same for the knockout, which pins a second blob for this design.
    const knockout = itemKnockouts[itemId];
    if (knockout) {
      URL.revokeObjectURL(knockout.previewUrl);
    }

    setItemPreviews(({ [itemId]: _removed, ...rest }) => rest);
    setItemAnalyses(({ [itemId]: _dropped, ...rest }) => rest);
    setItemKnockouts(({ [itemId]: _knockout, ...rest }) => rest);
    setItemKnockoutErrors(({ [itemId]: _error, ...rest }) => rest);
    setKnockoutWanted(({ [itemId]: _wanted, ...rest }) => rest);

    setOrder(
      recalculateOrder({
        ...order,
        items: order.items.filter((item) => item.id !== itemId),
      })
    );
  }

  /** Edit one design. Defaults to the first, which is the only one today. */
  function updateItem(
    updates: Partial<(typeof order.items)[number]>,
    itemId?: string
  ) {
    const targetId = itemId ?? order.items[0]?.id;

    setOrder(
      recalculateOrder({
        ...order,
        items: order.items.map((item) =>
          item.id === targetId ? { ...item, ...updates } : item
        ),
      })
    );
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
    // Functional form, and onto the RAW state. Spreading the rendered
    // `apparelQuote` would write the derived quantity back into state, giving
    // the value two homes again; and spreading a closed-over value loses the
    // first of two updates that batch in one tick.
    setApparelQuoteState((current) => ({
      ...current,
      ...updates,
    }));
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

    /**
     * Swallow drops that land OUTSIDE an upload box, and nothing more.
     *
     * Without this the browser navigates away to the dropped file and the
     * order in progress is gone. That is the whole job — this listener must
     * never upload anything, because it cannot know which design was aimed at.
     *
     * It used to call handleArtworkUpload(file) with no design id, on the
     * WINDOW in the capture phase, so it ran before the box that was actually
     * dropped on. Two things went wrong at once, and both were invisible:
     *
     *   No design id means design 1. Dropping artwork on design 2 assigned it
     *   to design 2 via the box AND to design 1 via this listener — silently
     *   replacing whatever design 1 already had. Verified in a browser: one
     *   drop on the second box, both boxes reporting the same file.
     *
     *   The handler was captured once, at mount, with an empty dependency
     *   list and a lint suppression claiming it was stable. It is not: it
     *   closes over `order` and the flow flags, so after "Start a new quote"
     *   it targeted a design id that no longer existed, and after switching
     *   to signs it still believed it was uploading a sticker.
     *
     * Each UploadBox owns its own onDrop and knows its own design. That is
     * the only place a dropped file can be routed correctly.
     */
    const swallowStrayDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      // Not inside a drop zone — the boxes call preventDefault themselves and
      // stop this from ever seeing their drops.
      event.preventDefault();
    };

    window.addEventListener("dragover", allowDrop);
    window.addEventListener("drop", swallowStrayDrop);

    return () => {
      window.removeEventListener("dragover", allowDrop);
      window.removeEventListener("drop", swallowStrayDrop);
    };
  }, []);

  async function handleArtworkUpload(file: File, itemId?: string) {
    const isStickers = !isSignsSelected && !isApparelSelected;
    /** Which design this file belongs to. Signs are a cart too now. */
    const targetId =
      itemId ??
      (isSignsSelected ? signsQuote.designs[0]?.id : order.items[0]?.id);

    // Revoke the URL we are replacing. createObjectURL pins the blob in memory
    // until revoked, and re-uploading repeatedly used to leak every previous
    // file for the life of the page. (CART-PLAN bug 2; removal and reset
    // revoke at their own call sites.)
    const replacing = isStickers
      ? itemPreviews[targetId]
      : isSignsSelected
      ? signsDesignPreviews[targetId]
      : artworkPreview;
    if (replacing) {
      URL.revokeObjectURL(replacing);
    }

    const previewUrl = URL.createObjectURL(file);

    if (isStickers) {
      setItemPreviews((prev) => ({ ...prev, [targetId]: previewUrl }));

      // A knockout belongs to the file it was cut from. Replacing the file
      // and keeping it would preview, proof and ship the OLD design's
      // silhouette against the new artwork's name.
      const staleKnockout = itemKnockouts[targetId];
      if (staleKnockout) {
        URL.revokeObjectURL(staleKnockout.previewUrl);
        setItemKnockouts(({ [targetId]: _stale, ...rest }) => rest);
      }
      setItemKnockoutErrors(({ [targetId]: _cleared, ...rest }) => rest);
      setKnockoutWanted(({ [targetId]: _wanted, ...rest }) => rest);
    } else if (isSignsSelected) {
      setSignsDesignPreviews((prev) => ({ ...prev, [targetId]: previewUrl }));
    } else {
      setArtworkPreview(previewUrl);
    }

    const analysis = await analyzeArtworkFile(file);

    if (isStickers) {
      setItemAnalyses((prev) => ({ ...prev, [targetId]: analysis }));
    }

    setArtworkAnalysis(analysis);

    if (isApparelSelected) {
      setApparelQuoteState((prev) => ({
        ...prev,
        inkColors: formatInkColorOption(
          getEstimatedInkColorCount(analysis, prev.garmentColor)
        ),
      }));
    }

    // Functional form, not a spread of `order`.
    //
    // This runs after an await, so the `order` captured when the upload
    // started is stale by the time it lands — anything the customer changed
    // while the file was being analysed was silently reverted. (CART-PLAN
    // bug 1.)
    if (isSignsSelected) {
      // Signs artwork lives on the design, not on the order — an order with
      // three signs in it has three files. Functional form for the same
      // reason as setOrder below: this runs after an await.
      setSignsQuote((prev) => ({
        designs: prev.designs.map((design) =>
          design.id === targetId ? { ...design, artwork: { file } } : design
        ),
      }));
    }

    setOrder((prev) => {
      if (!isStickers) {
        return { ...prev, artwork: { file } };
      }

      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === targetId
            ? {
                ...item,
                artwork: { file },
                // Auto-check the magenta cut line when one is detected, on
                // the design the file actually belongs to rather than on
                // "the product". Only ever turns it on; never overrides a
                // manual choice to off. (CART-PLAN bug 4.)
                magentaCutLine: analysis.magentaDetected
                  ? true
                  : item.magentaCutLine,
              }
            : item
        ),
      };
    });
  }

  /**
   * Knock the background out of one design's artwork, or put it back.
   *
   * The customer's ORIGINAL file is never replaced — the knockout is stored
   * beside it, so unticking the box returns them to exactly what they
   * uploaded, and the shop receives both regardless. See lib/background-
   * removal.ts for why this refuses more often than it tries.
   */
  /**
   * The artwork as the sticker will be made from it.
   *
   * Everything that depicts the finished product — the live preview, the
   * emailed proof — must read this rather than the raw upload, or the customer
   * approves one picture and the shop is briefed from another. The raw upload
   * is still what `itemPreviews` holds, and the before/after control shows it.
   */
  function getEffectivePreview(itemId: string) {
    return itemKnockouts[itemId]?.previewUrl ?? itemPreviews[itemId] ?? null;
  }

  async function toggleBackgroundRemoval(itemId: string, wanted: boolean) {
    const existing = itemKnockouts[itemId];

    setKnockoutWanted((prev) => ({ ...prev, [itemId]: wanted }));

    if (!wanted) {
      if (existing) URL.revokeObjectURL(existing.previewUrl);
      setItemKnockouts(({ [itemId]: _removed, ...rest }) => rest);
      setItemKnockoutErrors(({ [itemId]: _cleared, ...rest }) => rest);
      return;
    }

    const file = order.items.find((item) => item.id === itemId)?.artwork.file;
    if (!file) {
      setKnockoutWanted((prev) => ({ ...prev, [itemId]: false }));
      return;
    }

    setKnockoutBusyId(itemId);
    setItemKnockoutErrors(({ [itemId]: _cleared, ...rest }) => rest);

    const result = await removeBackground(file);

    setKnockoutBusyId(null);

    if (isRemovalFailure(result)) {
      // Back to unticked. Leaving it ticked beside an error would say we
      // removed a background we did not touch.
      setKnockoutWanted((prev) => ({ ...prev, [itemId]: false }));
      // Say which of the things went wrong. "Couldn't do it" gives the
      // customer nothing to act on; "the background isn't one flat colour"
      // tells them why their photo was never going to work.
      const message =
        result.reason === "background-not-flat"
          ? "The background isn't one flat colour, so we can't remove it cleanly here. Send us the file and we'll cut it out by hand before printing."
          : result.reason === "nothing-to-remove"
          ? "We couldn't find a background to remove around the edge of this file."
          : result.reason === "removed-everything"
          ? "Your design is too close in colour to its background, so removing the background would take the design with it. Send the file as it is and we'll cut it out by hand before printing."
          : result.reason === "not-an-image"
          ? "We can only do this on an image file (PNG or JPG). Send it over and we'll handle this one by hand."
          : "Something went wrong removing the background. Send the file as it is and we'll take care of it.";

      setItemKnockoutErrors((prev) => ({ ...prev, [itemId]: message }));
      return;
    }

    if (existing) URL.revokeObjectURL(existing.previewUrl);
    setItemKnockouts((prev) => ({ ...prev, [itemId]: result }));
  }

  /**
   * Edit one design. Defaults to the first, which is the only one on a
   * single-design quote — the same shape updateItem uses for the sticker cart.
   */
  function updateSignsDesign(
    updates: Partial<SignsDesign>,
    designId?: string
  ) {
    const targetId = designId ?? signsQuote.designs[0]?.id;

    setSignsQuote({
      designs: signsQuote.designs.map((design) =>
        design.id === targetId ? repairSignsDesign({ ...design, ...updates }) : design
      ),
    });
  }

  /**
   * Keep a design internally consistent after an edit.
   *
   * Every rule here is a stale-value hazard: the control that offered the
   * option disappears, and without this the value it set keeps being charged
   * and keeps appearing on the summary, the review card and the shop email.
   */
  function repairSignsDesign(next: SignsDesign): SignsDesign {

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

    return next;
  }

  /**
   * Add a design. Priced immediately, so the $15 setup lands in the estimate
   * the moment the design appears rather than surfacing at review.
   */
  function addSignsDesign() {
    setSignsQuote({
      designs: [...signsQuote.designs, createSignsDesign()],
    });
  }

  function removeSignsDesign(designId: string) {
    // Never remove the last one. An empty quote has no price and no way back,
    // and the customer would be looking at a form with nothing in it.
    if (signsQuote.designs.length <= 1) return;

    const preview = signsDesignPreviews[designId];
    if (preview) {
      // Removing the design drops the only reference to this object URL, so
      // without the revoke the blob is pinned for the life of the page.
      URL.revokeObjectURL(preview);
    }

    setSignsDesignPreviews(({ [designId]: _removed, ...rest }) => rest);

    setSignsQuote({
      designs: signsQuote.designs.filter((design) => design.id !== designId),
    });
  }

  function handleSignProductSelect(productId: string, designId?: string) {
    // Sizes/materials/finishing differ per sign type, so reset them to that
    // product's own defaults instead of keeping an invalid leftover choice.
    const product = getSignProduct(productId);
    const targetId = designId ?? signsQuote.designs[0]?.id;
    const current =
      signsQuote.designs.find((design) => design.id === targetId) ??
      signsQuote.designs[0];

    updateSignsDesign(
      {
        productId,
        size: getSizeOptions(product)[0],
        customSize: "",
        customWidthInches: 0,
        customHeightInches: 0,
        material: product.materials[0],
        finishing: product.finishing[0],
        doubleSided: allowsDoubleSided(product, product.materials[0])
          ? current.doubleSided
          : false,
      },
      targetId
    );
  }

  /**
   * Signs, per field.
   *
   * Same shape as the sticker rules in lib/validation.ts: this map is the
   * single source, and the summary list below is derived from it so the
   * checklist and the marked boxes can never name different problems.
   */
  /**
   * Required template fields the customer has not filled.
   *
   * Kept beside the sign rules rather than inside FieldErrors: these keys are
   * template-specific and would have to join the FieldKey union — and through
   * it FIELD_STEP — for every template anyone ever adds. They all live on the
   * details step regardless, so the step mapping is unaffected.
   */
  // LIVE — this decides whether the order can be submitted at all.
  //
  // Gating this on showFieldErrors was a real bug: validation saw no errors
  // until after a submit attempt, so an "OPEN HOUSE" sign with no address on
  // it reported itself ready and went through. Same distinction the cart
  // already draws — marks wait for a submit, readiness never does.
  // Per design, keyed by design id: a quote with three templated signs in it
  // has three sets of wording to fill in, and the customer has to be told
  // WHICH one is missing an address.
  const signsTemplateTextErrorsLive: Record<string, Record<string, string>> =
    Object.fromEntries(
      signsQuote.designs.map((design) => [
        design.id,
        getTemplateTextErrors(design.templateId, design.templateText),
      ])
    );

  const signsHasTemplateTextErrors = Object.values(
    signsTemplateTextErrorsLive
  ).some((errors) => Object.keys(errors).length > 0);

  // MARKED — what the designer actually paints red, held back until the
  // customer has tried to submit.
  const signsTemplateTextErrors: Record<string, Record<string, string>> =
    showFieldErrors ? signsTemplateTextErrorsLive : {};

  // The rules themselves live in lib/validation.ts so they can be tested;
  // this binds them to the component's state. See getSignsFieldErrors there.
  /** One design, in the shape the rules read. */
  function signsDesignInput(design: SignsDesign) {
    return {
      templateId: design.templateId,
      quantity: design.quantity,
      customWidthInches: design.customWidthInches,
      customHeightInches: design.customHeightInches,
      artwork: design.artwork,
      // Yard signs are frozen at one size and show no width/height field, so
      // they are the only product that does not owe dimensions.
      needsTypedSize:
        getSignProduct(design.productId).pricingMethod !== "yard",
    };
  }

  function getSignsFieldErrors(): FieldErrors {
    return getSignsFieldErrorsFor(
      signsQuote.designs.map(signsDesignInput),
      order
    );
  }

  /** Marks for one design's own card. Empty until a submit is attempted. */
  const signsDesignFieldErrors: Record<string, ItemFieldErrors> =
    showFieldErrors
      ? Object.fromEntries(
          signsQuote.designs.map((design) => [
            design.id,
            getSignsDesignFieldErrors(signsDesignInput(design)),
          ])
        )
      : {};

  function getSignsValidationErrors() {
    // The sentences themselves live in lib/validation.ts, for the reason
    // AGENTS.md gives: rules nothing can test are the ones with gaps, and
    // this list had one.
    return getSignsValidationSummary(
      signsQuote.designs.map((design) => ({
        ...signsDesignInput(design),
        templateTextErrors: signsTemplateTextErrorsLive[design.id] || {},
      })),
      order
    );
  }

  // The rules themselves live in lib/validation.ts so they can be tested;
  // this binds them to the component's state. See getApparelFieldErrors there.
  function getApparelFieldErrors(): FieldErrors {
    return getApparelFieldErrorsFor(apparelQuote, order, sizeQuantityTotal);
  }

  function getApparelValidationErrors() {
    const fields = getApparelFieldErrors();
    const errors: string[] = [];

    // Pushed straight from the field map, as stickers and signs already do.
    // These four used to be re-worded here into passive spec voice ("Customer
    // name is required.") while the other two flows said "Enter your name." —
    // one checklist panel speaking differently depending on which product the
    // customer happened to pick. The summary is prose, and this is the voice
    // the rest of it uses.
    if (fields.customerName) errors.push(fields.customerName);
    if (fields.customerEmail) errors.push(fields.customerEmail);
    if (fields.artwork) errors.push("Upload your artwork.");
    if (fields.needBy) errors.push(fields.needBy);

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
    /**
     * Order-level fields, on every quote whatever the flow.
     *
     * These used to be typed out again in each branch. The sticker branch
     * spreads the whole order and so picked up add-ons for free; signs and
     * apparel enumerate their fields and simply never listed addOns or
     * addOnsNote — so the "Add to this quote" strip, which renders once for
     * ALL THREE flows, threw the customer's answer away on two of them. They
     * ticked a banner onto a signs order and the shop was never told.
     *
     * Naming the envelope once is the fix. The next order-level field is
     * added here and reaches every flow, instead of reaching whichever branch
     * the author happened to be looking at.
     */
    const orderEnvelope = {
      customer: order.customer,
      production: order.production,
      addOns: order.addOns,
      addOnsNote: order.addOnsNote,
      /**
       * Present only on the shop's own terminal. The SERVER reads this to
       * decide that no payment link is generated — see app/api/quote/route.ts.
       * Claiming it cannot get anyone a better outcome: the only thing it
       * buys is NOT being emailed a link to pay.
       */
      ...(kiosk.enabled
        ? { kiosk: { mode: kiosk.mode, staffName: kiosk.staffName } }
        : {}),
    };

    if (isSignsSelected) {
      // The mapping lives in lib/signs-payload.ts so a test can drive the
      // real one rather than rebuilding it — see the note at the top of that
      // file, and the double-charge it caught.
      return {
        ...orderEnvelope,
        ...buildSignsPayloadParts(signsQuote.designs, signsPricing),
      };
    }

    if (isApparelSelected) {
      return {
        ...orderEnvelope,
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

    // Stickers.
    //
    // `product` is SYNTHESISED here and must stay. isStickerOrder() in
    // app/api/quote/route.ts decides which submissions auto-generate a
    // Printavo payment link, and it reads product.type plus the absence of
    // supplier/garmentType/signType. Ship a payload without `product` and
    // stickers silently stop checking out — no error anywhere, just no money.
    //
    // It describes the ORDER, not one design: the type the classifier needs,
    // the combined quantity, and the first design's spec so single-design
    // quotes read exactly as they always have. `items` carries the truth.
    const firstItem = order.items[0];
    const totalQuantity = order.items.reduce(
      (sum, item) => sum + Math.max(0, item.quantity),
      0
    );

    return {
      ...order,
      // Redundant here — `...order` already carries these — but stated so all
      // three branches visibly guarantee the same envelope, and so this one
      // does not quietly become the only flow that works again.
      ...orderEnvelope,
      product: {
        ...firstItem,
        quantity: totalQuantity,
        designCount: order.items.length,
      },
      items: order.items.map((item) => ({
        id: item.id,
        type: item.type,
        quantity: item.quantity,
        size: item.size,
        widthInches: item.widthInches,
        heightInches: item.heightInches,
        shape: item.shape,
        material: item.material,
        finish: item.finish,
        artScale: item.artScale,
        artMargin: item.artMargin,
        magentaCutLine: item.magentaCutLine,
        artworkFileName: item.artwork.file?.name || null,
        // Prepress has to know before it opens anything: a die cut off a solid
        // background is a rectangle until someone knocks the background out.
        // A knockout answers that question, so it reports as resolved.
        hasTransparentEdges: itemKnockouts[item.id]
          ? true
          : itemAnalyses[item.id]?.hasTransparentEdges ?? null,
        /** The customer asked us to knock the background out, and we did. */
        backgroundRemoved: Boolean(itemKnockouts[item.id]),
        backgroundRemovedColor:
          itemKnockouts[item.id]?.backgroundColor ?? null,
      })),
      // The order-level slot stays for the shop email's existing artwork
      // block; per-design files are named on each item above.
      artwork: { file: firstItem.artwork.file },
    };
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

    // Prefill the contact boxes when the customer arrives at the step that
    // has them, once, and never over anything already typed.
    //
    // On the NAVIGATION rather than in an effect, deliberately. Copying an
    // external store into React state with a synchronous effect is the shape
    // React's own guidance warns about, and the lint rule here treats it as
    // an error — rightly: it costs a second render on every mount to move a
    // value that only matters when somebody reaches this step. Arriving at
    // Contact is a real event, and it is exactly when the prefill is useful.
    if (id === "contact" && offerRemembered && !rememberedApplied) {
      applyRemembered();
    }
  }

  /**
   * Fill the empty contact boxes from what this device remembers.
   *
   * Only the four fields applyRememberedContact returns are spread in.
   * newsletterOptIn is not among them and never will be — consent is
   * re-asked, not remembered.
   */
  function applyRemembered() {
    if (!rememberedContact) return;

    setOrder((prev) => {
      const updates = applyRememberedContact(rememberedContact, prev.customer);
      if (!Object.keys(updates).length) return prev;

      return { ...prev, customer: { ...prev.customer, ...updates } };
    });

    setRememberedApplied(true);
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
    // A kiosk is hidden every time somebody walks away from it, so this would
    // report an "abandoned quote" for every passer-by who touched the screen —
    // burying the real ones under half-typed strangers. On a shared machine
    // the walk-away is not a lead, it is the normal end of a session.
    if (kiosk.enabled) return;

    function reportAbandonedQuote() {
      const snapshot = leadSnapshotRef.current;

      if (!snapshot || leadSentRef.current) return;
      // They finished. The quote itself is the record; a second notice saying
      // they did not finish would be actively wrong.
      if (snapshot.submitted) return;
      // No address means nothing to follow up on. Asks the shared rule rather
      // than carrying a third copy of the regex — this gate and the one in
      // /api/lead had drifted apart from it already.
      if (!looksLikeEmailAddress(snapshot.email)) return;

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
  }, [kiosk.enabled]);

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
      // Template text is validated outside FieldErrors (its keys are
      // per-template and cannot join the FieldKey union), so it has no entry
      // in FIELD_STEP and getFirstStepWithError cannot see it. Without this
      // fallback, an unfilled template field blocks submit and then leaves the
      // customer on Review with nothing marked and nowhere to go — the exact
      // dead end the field-to-step map exists to prevent.
      const firstBrokenStep =
        getFirstStepWithError(getCurrentFieldErrors()) ??
        // Keyed by design id and populated for EVERY design, so counting the
        // keys would be counting designs — always truthy, sending every
        // failed submit to Details whatever was actually wrong.
        (isSignsSelected && signsHasTemplateTextErrors
          ? ("details" as const)
          : null);

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
      const isStickerFlow = !isSignsSelected && !isApparelSelected;

      // Every design that has a file, in cart order. Signs and apparel are
      // single-file flows and keep the order-level slot.
      const artworkParts = isStickerFlow
        ? order.items
            .filter((item) => item.artwork.file)
            .map((item) => ({ id: item.id, file: item.artwork.file! }))
        : order.artwork.file
        ? [{ id: "order", file: order.artwork.file }]
        : [];

      // Preferred path: straight to blob storage, bypassing the function and
      // its body limit entirely. Falls back on its own if no blob store is
      // connected, so the form keeps working either way.
      //
      // Parts are keyed by design id — NEVER appended to a shared "artwork"
      // key. form.getAll() on a shared key returns an array whose indices
      // silently shift when one design has no file, which misaligns every
      // later file with the wrong design (CART-PLAN §Per-item artwork).
      let inlineBytesUsed = 0;
      const droppedArtwork: { id: string; name: string; size: number }[] = [];

      for (const part of artworkParts) {
        const blobUrl = await uploadArtworkToBlob(part.file, setUploadProgress);

        if (blobUrl) {
          formData.append(`artworkUrl:${part.id}`, blobUrl);
          formData.append(`artworkName:${part.id}`, part.file.name);
          formData.append(`artworkSize:${part.id}`, String(part.file.size));
          continue;
        }

        // No blob store. The file has to ride in the request body, which the
        // platform kills above ~4.4 MB before the route ever runs — so the
        // budget is enforced here, where a drop costs an attachment instead of
        // the whole order.
        const wouldExceed =
          isArtworkTooLargeToAttach(part.file) ||
          inlineBytesUsed + part.file.size > MAX_INLINE_ARTWORK_TOTAL_BYTES;

        if (wouldExceed) {
          droppedArtwork.push({
            id: part.id,
            name: part.file.name,
            size: part.file.size,
          });
          continue;
        }

        formData.append(`artwork:${part.id}`, part.file, part.file.name);
        inlineBytesUsed += part.file.size;
      }

      /**
       * The knocked-out artwork, alongside the original it was made from.
       *
       * Sent so prepress has the file the customer actually approved rather
       * than having to redo the matting and hope it lands in the same place.
       * It is a HEAD START, never the deliverable — the original is always
       * there to work from, which is why this yields the budget to it and is
       * dropped first if the body is tight.
       */
      // Gated on the sticker flow, like the artwork loop above and the proof
      // loop below. It was not, and order.items keeps a sticker item in EVERY
      // flow — so a customer who knocked out a sticker and then switched to
      // signs sent that abandoned file along with their banner. See
      // collectKnockoutCandidates.
      const knockoutCandidates = collectKnockoutCandidates(
        isStickerFlow,
        order.items.map((item) => item.id),
        Object.fromEntries(
          Object.entries(itemKnockouts).map(([id, knockout]) => [
            id,
            { name: knockout.file.name, size: knockout.file.size },
          ])
        )
      );

      const knockoutPlan = planKnockouts(knockoutCandidates, inlineBytesUsed);

      for (const candidate of knockoutPlan.attached) {
        const knockout = itemKnockouts[candidate.id];
        if (!knockout) continue;

        formData.append(
          `knockout:${candidate.id}`,
          knockout.file,
          knockout.file.name
        );
      }

      inlineBytesUsed = knockoutPlan.bytesUsed;

      // Named, not silently missing. The shop needs to know which design's
      // file to chase, and the customer's quote still goes through.
      if (droppedArtwork.length) {
        formData.append("artworkDropped", JSON.stringify(droppedArtwork));
      }

      setUploadProgress(null);

      /**
       * The proof the customer just approved, rendered to a PNG so the email
       * carries it alongside their raw art. Stickers only — it is the only
       * flow with a preview to prove.
       *
       * ONE PER DESIGN, keyed like the artwork. This used to render a single
       * proof from `artworkPreview`, which the cart stopped setting: sticker
       * previews moved to itemPreviews[id], so `isStickers && artworkPreview`
       * became permanently false and NO proof has been attached to a sticker
       * quote since. Verified by capturing a real two-design submission — the
       * body carried the order, the analysis and two files, and no proof at
       * all.
       *
       * Rendered from the design's own preview, so each proof shows that
       * design's art at that design's size, shape and border.
       */
      const isStickers = !isSignsSelected && !isApparelSelected;
      let proofsAttached = 0;
      let proofBytesUsed = 0;
      // Proofs take what artwork left behind. Going over the body limit does
      // not lose a picture, it loses the order — see lib/upload-limits.
      const proofBudget = remainingInlineBudget(inlineBytesUsed);

      if (isStickers) {
        for (const [index, item] of order.items.entries()) {
          const preview = getEffectivePreview(item.id);
          if (!preview) continue;

          // Falls back to the preset label, which is a square, when the
          // customer used a size button instead of typing dimensions.
          const presetInches = parseSizeInches(item.size);

          const proof = await renderStickerProof({
            artworkUrl: preview,
            shape: item.shape,
            material: item.material,
            finish: item.finish,
            sizeLabel: item.size,
            quantity: item.quantity,
            widthInches: item.widthInches || presetInches,
            heightInches: item.heightInches || presetInches,
            artScale: item.artScale,
            artBleed: item.artBleed,
            artMargin: item.artMargin,
            magentaCutLine: item.magentaCutLine,
            // A knockout IS the transparency, so the proof must stop warning
            // about a background that is no longer there — it is rendering the
            // knocked-out art, and saying otherwise would contradict the
            // picture directly above the caption.
            hasTransparentEdges: itemKnockouts[item.id]
              ? true
              : itemAnalyses[item.id]?.hasTransparentEdges ?? null,
          });

          if (!proof) continue;

          if (proofBytesUsed + proof.size > proofBudget) {
            // Out of room. The shop still has the artwork and the written
            // spec, so a missing proof costs a picture — never the order.
            break;
          }

          formData.append(
            `proof:${item.id}`,
            proof,
            order.items.length > 1
              ? `design-${index + 1}-proof.png`
              : "gorilla-proof.png"
          );
          proofBytesUsed += proof.size;
          proofsAttached += 1;
        }

        // Named, so "Our proof" in the shop email can never imply every design
        // got one when the body ran out of room partway through.
        if (proofsAttached < order.items.filter((i) => getEffectivePreview(i.id)).length) {
          formData.append("proofsDropped", "true");
        }
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
        /**
         * Whether this joined an existing Printavo contact or made a new one.
         * The API has always returned it; nothing has ever shown it. Only the
         * counter renders it — see lib/customer-record.ts.
         */
        customerRecord: result.printavo
          ? {
              created: Boolean(result.printavo.created),
              skipped: Boolean(result.printavo.skipped),
              matchedExistingCustomer: Boolean(
                result.printavo.matchedExistingCustomer
              ),
              createdCustomer: Boolean(result.printavo.createdCustomer),
            }
          : null,
        printavoCreated: Boolean(result.printavo?.created),
      });

      setSubmittedProductId(selectedProductId);
      setQuoteSubmitted(true);

      /**
       * Remember the contact details for next time — contact fields only.
       *
       * toRememberedContact builds a fresh object from four named fields, so
       * handing it the whole customer record cannot leak notes, attribution
       * or the newsletter tick. Never at the kiosk: see the note beside
       * `offerRemembered`.
       */
      if (!kiosk.enabled) {
        const contact = toRememberedContact(order.customer);
        if (contact) rememberCustomer(contact);
      }
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
Phone: ${order.customer.phone || "N/A"}
Heard about us via: ${
      order.customer.heardAbout.length
        ? order.customer.heardAbout.join(", ")
        : "Not answered"
    }`;

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
      const designBlocks = signsQuote.designs
        .map((design, index) => {
          const signProduct = getSignProduct(design.productId);
          const heading =
            signsQuote.designs.length > 1
              ? `DESIGN ${index + 1}`
              : "SIGNS DETAILS";

          return `${heading}
Product: ${signProduct.label}
Quantity: ${design.quantity.toLocaleString()}
Size: ${getSignSizeLabel(design)}
Material: ${design.material}
Finishing: ${design.finishing}
Sides: ${design.doubleSided ? "Double-sided" : "Single-sided"}`;
        })
        .join("\n\n");

      return `GORILLA SALEM SIGNS QUOTE REQUEST

Quote Number: ${quoteNumber}
Submitted: ${submittedAt}

${customerSection}

${designBlocks}

${timelineSection}

ESTIMATE
${
  signsPricing.priceable
    ? `${signsPricing.lines
        .filter((l) => l.amount !== 0)
        .map((l) => `${l.label}: $${l.amount.toFixed(2)}`)
        .join("\n")}
Estimated ${SALES_TAX.label}: $${getSignsTotals(signsPricing).estimatedTax.toFixed(2)}
Estimated Total: $${getSignsTotals(signsPricing).estimatedTotal.toFixed(2)}${
        // One design only — across a cart this is an average of unlike
        // things and names a price no sign in the order actually costs.
        signsPricing.designs.length === 1 && signsPricing.quantity > 1
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
Designs: ${order.items.length}
${order.items
      .map((item, index) =>
        [
          order.items.length > 1 ? `--- Design ${index + 1} ---` : null,
          `Quantity: ${item.quantity.toLocaleString()}`,
          `Size: ${item.size}`,
          `Shape: ${item.shape}`,
          `Sticker Type: ${item.material}`,
          `Art Placement: ${item.artScale}% size, ${item.artMargin}% ${
            item.shape === "Die Cut" ? "cut border" : "margin"
          }`,
          `Magenta Cut Line: ${
            item.magentaCutLine ? "Yes — art includes a magenta cut line" : "No"
          }`,
          `Artwork File: ${item.artwork.file?.name || "No file uploaded"}`,
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n")}

${timelineSection}

ESTIMATE
Stickers: $${order.pricing.stickerPrice.toFixed(2)}
Setup: $${order.pricing.setupPrice.toFixed(2)}${
      order.items.length > 1
        ? ` ($25 first design + $12.50 x ${order.items.length - 1})`
        : ""
    }
Shipping: ${
      order.pricing.shippingPrice > 0
        ? `$${order.pricing.shippingPrice.toFixed(2)}`
        : "Free (local pickup)"
    }
Estimated ${SALES_TAX.label}: $${getStickerTotals(order.pricing).estimatedTax.toFixed(2)}
Estimated Total: $${getStickerTotals(order.pricing).estimatedTotal.toFixed(2)}${
      order.items.length === 1
        ? `\nEstimated Each: $${unitPrice.toFixed(2)} per sticker`
        : ""
    }

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

    // Every design's preview, not just the last one touched. Starting a new
    // quote used to strand one object URL per design for the life of the tab.
    // (CART-PLAN bug 2.)
    Object.values(itemPreviews).forEach((url) => URL.revokeObjectURL(url));
    // Knockouts hold an object URL each, on exactly the same terms.
    Object.values(itemKnockouts).forEach((knockout) =>
      URL.revokeObjectURL(knockout.previewUrl)
    );
    setItemPreviews({});
    setItemAnalyses({});
    setItemKnockouts({});
    setItemKnockoutErrors({});
    setKnockoutWanted({});

    // A fresh item, not the one baked into defaultOrder at import time —
    // reusing it would hand every reset order the same design id, and ids are
    // what submit keys artwork parts on.
    // Signs are a cart too now, and their previews leak on exactly the same
    // terms — one stranded object URL per design, for the life of the tab.
    Object.values(signsDesignPreviews).forEach((url) =>
      URL.revokeObjectURL(url)
    );
    setSignsDesignPreviews({});

    setOrder({ ...defaultOrder, items: [createStickerItem()] });
    setApparelQuoteState(defaultApparelQuote);
    // A fresh design, for the same reason as the sticker item above: reusing
    // the one baked in at import time hands every reset quote the same design
    // id, and the preview map is keyed on it. That is how a new customer ends
    // up looking at the last one's artwork.
    setSignsQuote(createSignsQuote());
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
  /**
   * What one sticker of a given design costs.
   *
   * That design's material plus its OWN share of setup — the first design
   * carries $25 and each later one $12.50, which is exactly what that design
   * added to the bill. Dividing the whole cart's setup across one design's
   * quantity would make design 1 look dearer every time another was added.
   */
  function getItemUnitPrice(item: (typeof order.items)[number]) {
    const index = order.items.findIndex((entry) => entry.id === item.id);
    const share = index === 0 ? STICKER_SETUP_FEE : STICKER_SETUP_FEE_ADDITIONAL;

    const material = getStickerMaterialPrice(
      snapQuantity(item.quantity),
      item.material,
      item.size,
      { widthInches: item.widthInches, heightInches: item.heightInches }
    );

    return (material + share) / Math.max(1, item.quantity);
  }

  const unitPrice = getItemUnitPrice(order.items[0]);
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

  // Per-design marks. The flat map above reports the FIRST broken design, which
  // is what submit jumps to; this is what lets each card mark its own boxes so
  // a customer with three designs can see which one is short.
  const itemFieldErrors: Record<string, ItemFieldErrors> = showFieldErrors
    ? Object.fromEntries(
        order.items.map((item) => [item.id, getItemFieldErrors(item)])
      )
    : {};

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
    // One proof per design. Showing a single frame for a three-design quote
    // would be showing one of them and implying it was all of them.
    <div className="space-y-6">
      {signsQuote.designs.map((design, index) => (
        <SignsPreviewCard
          key={design.id}
          design={design}
          artworkPreview={signsDesignPreviews[design.id] || null}
          label={
            signsQuote.designs.length > 1
              ? `Digital Proof · Design ${index + 1} of ${signsQuote.designs.length}`
              : null
          }
        />
      ))}
    </div>
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
    // One live proof per design. Showing only the first design's proof beside
    // a two-design cart is worse than showing none: the art placement sliders
    // on it edit that design, so a customer adjusting "the preview" would be
    // changing a design they are not looking at.
    <div className="space-y-6">
      {order.items.map((item, index) => (
        <div key={item.id}>
          {order.items.length > 1 && (
            <p className="spec mb-2 text-spec uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Design {String(index + 1).padStart(2, "0")} /{" "}
              {String(order.items.length).padStart(2, "0")}
            </p>
          )}

          <DecalPreviewCard
            artworkPreview={getEffectivePreview(item.id)}
            product={item}
            production={order.production}
            unitPrice={getItemUnitPrice(item)}
            onUpdateProduct={(updates) => updateItem(updates, item.id)}
          />
        </div>
      ))}
    </div>
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

  /**
   * Choosing a product. Extracted because the large-format band selects the
   * same way the cards do, and the brief's own acceptance criterion is that
   * selecting Banners produces the identical downstream state it did before.
   * Two copies of this would be two chances for that to stop being true.
   */
  function selectProduct(product: ProductCategory) {
    setSelectedProductId(product.id);
    updateItem({ type: product.title });

    // Apparel is a hand-quote request, not the configurator. Pinning
    // specialOrder here routes it down the path that already exists for
    // "priced by hand": no online estimate, quoteRequired on the payload,
    // and — because that payload carries garmentType and supplier — never
    // classified as a sticker order, which is the only flow that self-bills.
    if (product.status === "request") {
      setApparelQuoteState((current) => ({ ...current, specialOrder: true }));
    }

    // Errors belong to the flow that produced them. Without this, failing
    // submit on stickers and then switching to signs carried the red marks
    // across to a form the customer had not tried to submit yet.
    setShowFieldErrors(false);
  }

  const stepHeading = (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{step.label}</p>

        <h2
          // Names the group that wraps all three options below. Only on the
          // product step: this heading is shared with every other step.
          id={currentStepId === "product" ? "product-heading" : undefined}
          className="mt-2 text-head font-bold tracking-display text-[var(--ink-black)]"
        >
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
          {/* Same rule as .eyebrow above it in the cascade: this is a hand-
              rolled eyebrow and was the one bit of alarm ink on an otherwise
              monochrome hero. A location is not a warning. */}
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Printed Locally in Salem, MA
          </p>

          <h1 className="mt-3 max-w-4xl text-display font-bold tracking-display text-[var(--ink-black)] sm:text-display lg:text-display">
            Custom print quotes made simple.
          </h1>

          <p className="mt-5 max-w-2xl text-lede leading-8 text-[var(--ink-muted)]">
            Choose your details, upload your artwork, and get a live estimate or
            quote request before sending it to Gorilla Salem.
          </p>

          {/* Bordered, and in muted ink rather than green.
              These were the only unbordered boxes in a system where every
              other container has an edge, and they were set in
              --gorilla-green, which everywhere else in this UI means SELECTED
              or CONFIRMED. They are marketing claims, not states, and a
              customer learning the colour vocabulary from this screen was
              being taught it wrong before they reached a single control. */}
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              "Hand-printed locally",
              "Salem, Massachusetts",
              "Real proof review before production",
            ].map((claim) => (
              <span
                key={claim}
                className="border border-[var(--rule)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink-muted)]"
              >
                {claim}
              </span>
            ))}
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

          {/* All three options in one group, so the semantic set survives the
              visual split: the band below is a different SHAPE, not a
              different question. */}
          <div role="group" aria-labelledby="product-heading">
            <div className="grid gap-4 md:grid-cols-2">
              {productCategories
                .filter((product) => product.segment === "decorated")
                .map((product) => {
                  // "request" is selectable — it just has no online price.
                  const isActive = product.status !== "coming-soon";
                  const isSelected = selectedProductId === product.id;

                  // The one flow that returns a number AND takes the payment.
                  // Read off the fulfilment line rather than the id, because
                  // that string is already asserted against isStickerOrder()
                  // in tests/product-fulfilment.test.ts — the server function
                  // that actually decides it.
                  const takesPayment = /pay online/i.test(product.fulfilment);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={!isActive}
                      onClick={() => selectProduct(product)}
                      aria-pressed={isSelected}
                      className={`border p-5 text-left transition ${
                        isSelected
                          ? // cursor-pointer was on the UNSELECTED variant
                            // only, so choosing a product made its card read
                            // as disabled.
                            "cursor-pointer border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                          : isActive
                          ? // Was hover:-translate-y-0.5 — a lift toward the
                            // viewer, which is soft elevation, in a system
                            // that committed to letterpress (radius 0,
                            // --offset 3px, hairlines, no shadows) and presses
                            // every other control DOWN and away. The border
                            // stepping to ink is the house move, and unlike a
                            // 1px→2px border it cannot shift the layout.
                            "cursor-pointer border-[var(--rule)] bg-white hover:border-[var(--ink-black)]"
                          : "cursor-not-allowed border-[var(--rule)] bg-[var(--shirt-blank)] opacity-70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-lg font-bold text-[var(--ink-black)]">
                          {product.title}
                        </p>

                        {/* Selection was carried by border and fill colour and
                            nothing else, which fails SC 1.4.1 and leaves a
                            greyscale or colour-blind reader with cards that
                            look alike. aria-pressed above says it to assistive
                            tech; this says it on the screen. */}
                        {isSelected && (
                          <span className="spec shrink-0 bg-[var(--gorilla-green)] px-2 py-1 text-spec font-bold text-white">
                            SELECTED
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-muted)]">
                        {product.description}
                      </p>

                      {/* What happens after submit, not how finished the flow
                          is. Each option carries exactly one of these now —
                          the "Beta" and "By request" badges said the same
                          thing again in a second vocabulary, and on Banners
                          one of them contradicted the other outright.

                          Green on the pay-online line is deliberate and is the
                          only place it appears unselected: that path is the
                          one that returns a number and takes the money, and
                          the SELECTED chip carries selection on its own. */}
                      <p
                        className={`mt-4 text-xs font-bold uppercase tracking-[0.16em] ${
                          takesPayment
                            ? "text-[var(--gorilla-green)]"
                            : "text-[var(--ink-muted)]"
                        }`}
                      >
                        {product.status === "coming-soon"
                          ? "Coming soon"
                          : product.fulfilment}
                      </p>
                    </button>
                  );
                })}
            </div>

            {productCategories
              .filter((product) => product.segment === "large-format")
              .map((product) => {
                const isSelected = selectedProductId === product.id;

                return (
                  <div key={product.id}>
                    {/* A rule-label, in the system's existing
                        hairline-as-structure vocabulary. */}
                    <div className="mt-8 flex items-center gap-4">
                      <p className="spec text-spec font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                        Large format
                      </p>
                      <span
                        aria-hidden="true"
                        className="h-px flex-1 bg-[var(--rule)]"
                      />
                    </div>

                    {/* Full width, not a smaller card. A band reads as a
                        DIFFERENT KIND of thing; a narrower card would read as
                        a worse one, and this is the segment that already
                        returns a real price. */}
                    <button
                      type="button"
                      onClick={() => selectProduct(product)}
                      aria-pressed={isSelected}
                      className={`mt-4 flex w-full min-h-[44px] cursor-pointer flex-col gap-3 border p-5 text-left transition-colors duration-[120ms] ease-linear active:translate-x-[2px] active:translate-y-[2px] ${
                        isSelected
                          ? "border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
                          : "border-[var(--rule)] bg-white hover:border-[var(--ink-black)]"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <p className="text-lg font-bold text-[var(--ink-black)]">
                          {product.title}
                        </p>

                        <div className="flex items-center gap-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                            {product.fulfilment}
                          </p>

                          {isSelected && (
                            <span className="spec shrink-0 bg-[var(--gorilla-green)] px-2 py-1 text-spec font-bold text-white">
                              SELECTED
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="max-w-2xl text-sm font-bold leading-6 text-[var(--ink-muted)]">
                        {product.description}
                      </p>

                      {product.note && (
                        // Not font-bold, deliberately. Everything on this
                        // screen is 700, which flattens the hierarchy; this
                        // line is where that starts being unwound.
                        <p className="max-w-2xl text-fine text-[var(--ink-muted)]">
                          {product.note}
                        </p>
                      )}
                    </button>
                  </div>
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
                <>
                  {/* One card per design, all expanded — the same shape the
                      sticker cart uses. DesignCard renders nothing but its
                      children when there is only one, so a single-design quote
                      looks exactly as it did. */}
                  {signsQuote.designs.map((design, index) => (
                    <DesignCard
                      key={design.id}
                      index={index}
                      total={signsQuote.designs.length}
                      onRemove={() => removeSignsDesign(design.id)}
                    >
                      <div className="space-y-8">
                        <SignsBuilder
                          design={design}
                          fieldErrors={
                            signsQuote.designs.length > 1
                              ? signsDesignFieldErrors[design.id] || {}
                              : fieldErrors
                          }
                          onUpdate={(updates) =>
                            updateSignsDesign(updates, design.id)
                          }
                          onSelectProduct={(productId) =>
                            handleSignProductSelect(productId, design.id)
                          }
                        />

                        {/* Sits on the details step, with the rest of what the
                            sign IS. The artwork step then either takes an
                            upload or shows that the template already covers
                            it. */}
                        <TemplateDesigner
                          productId={design.productId}
                          templateId={design.templateId}
                          values={design.templateText}
                          errors={signsTemplateTextErrors[design.id] || {}}
                          onSelectTemplate={(templateId) =>
                            updateSignsDesign(
                              {
                                templateId,
                                // Starting a different template must not carry
                                // the previous one's words into fields that do
                                // not exist on it.
                                templateText: {},
                              },
                              design.id
                            )
                          }
                          onChangeText={(fieldId, value) =>
                            updateSignsDesign(
                              {
                                templateText: {
                                  ...design.templateText,
                                  [fieldId]: value,
                                },
                              },
                              design.id
                            )
                          }
                        />
                      </div>
                    </DesignCard>
                  ))}

                  <button
                    type="button"
                    onClick={addSignsDesign}
                    className={[
                      "min-h-[44px] w-full cursor-pointer border border-dashed border-[var(--rule)]",
                      "bg-[var(--shirt-blank)] px-4 py-3 text-fine font-bold text-[var(--ink-black)]",
                      "transition-colors duration-[120ms] ease-linear",
                      "hover:border-[var(--ink-black)] hover:bg-white",
                      "active:translate-x-[2px] active:translate-y-[2px]",
                    ].join(" ")}
                  >
                    + Add another sign
                    <span className="ml-2 font-normal text-[var(--ink-muted)]">
                      adds ${signsPricingConfig.setupFee} setup
                    </span>
                  </button>

                  {/* Once, not per design. Three signs in a quote still ship
                      together. */}
                  <SignsDelivery
                    deliveryMethod={order.production.deliveryMethod}
                    onSelect={(deliveryMethod) =>
                      updateProduction({ deliveryMethod })
                    }
                  />
                </>
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
                <div className="space-y-6">
                  {order.items.map((item, index) => (
                    <DesignCard
                      key={item.id}
                      index={index}
                      total={order.items.length}
                      onRemove={() => removeDesign(item.id)}
                    >
                      <DecalBuilder
                        product={item}
                        deliveryMethod={order.production.deliveryMethod}
                        hasArtwork={Boolean(item.artwork.file)}
                        magentaDetected={Boolean(
                          itemAnalyses[item.id]?.magentaDetected
                        )}
                        hasTransparentEdges={
                          itemAnalyses[item.id]?.hasTransparentEdges ?? null
                        }
                        fieldErrors={itemFieldErrors[item.id] || {}}
                        // Delivery is an order-level choice, so only the first
                        // card offers it — three "ship or pick up?" questions
                        // for one parcel is three chances to disagree.
                        showDelivery={index === 0}
                        onSelectDeliveryMethod={(deliveryMethod) =>
                          updateProduction({ deliveryMethod })
                        }
                        onUpdate={(updates) => updateItem(updates, item.id)}
                        onSelectMaterial={(material) =>
                          updateItem(
                            {
                              material,
                              finish: getDecalFinishFromMaterial(material),
                            },
                            item.id
                          )
                        }
                      />
                    </DesignCard>
                  ))}

                  {/* Says what it costs before they press it. The fee ladder
                      is the whole reason the cart exists, and finding out at
                      review that a design added $12.50 is the kind of surprise
                      that loses an order. */}
                  <button
                    type="button"
                    onClick={addDesign}
                    className={[
                      "flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-3",
                      "border-2 border-dashed border-[var(--rule)] bg-[var(--paper)] p-4",
                      "text-fine font-bold text-[var(--ink-black)]",
                      "transition-colors duration-[120ms] ease-linear",
                      "hover:border-solid hover:border-[var(--ink-black)]",
                      "active:translate-x-[2px] active:translate-y-[2px]",
                    ].join(" ")}
                  >
                    + Add another design
                    <span className="spec text-spec font-normal text-[var(--ink-muted)]">
                      +${STICKER_SETUP_FEE_ADDITIONAL.toFixed(2)} setup
                    </span>
                  </button>
                </div>
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
              {isSignsSelected ? (
                // One box per design, bound to its design by closure — the
                // same rule the sticker cart follows, and for the same reason:
                // a `multiple` input gives an array with no reliable mapping
                // back to a design.
                <div className="space-y-6">
                  {signsQuote.designs.map((design, index) => (
                    <DesignCard
                      key={design.id}
                      index={index}
                      total={signsQuote.designs.length}
                      onRemove={() => removeSignsDesign(design.id)}
                    >
                      {design.templateId ? (
                        // A template already IS the artwork, so this design has
                        // nothing to ask for. Saying so beats leaving an upload
                        // box that looks required on a step already satisfied.
                        <div className="border border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)] bg-[var(--surface-ok)] p-5">
                          <p className="eyebrow">Artwork</p>
                          <h3 className="mt-2 text-lede font-bold text-[var(--gorilla-green-dark)]">
                            Covered — you&rsquo;re using our{" "}
                            {getTemplate(design.templateId)?.name.toLowerCase()}{" "}
                            template
                          </h3>
                          <p className="mt-2 text-fine font-bold text-[var(--gorilla-green-dark)]">
                            Nothing to upload. We set your wording into the
                            artwork and send a proof before printing. Changed
                            your mind? Go back to details and choose
                            &ldquo;I&rsquo;ll upload my own artwork&rdquo;.
                          </p>
                        </div>
                      ) : (
                        <UploadBox
                          onFileSelected={(file) =>
                            handleArtworkUpload(file, design.id)
                          }
                          fileName={design.artwork.file?.name || null}
                          fileSizeBytes={design.artwork.file?.size ?? null}
                          directUploadEnabled={directUploadEnabled}
                          previewUrl={signsDesignPreviews[design.id] || null}
                          error={
                            signsQuote.designs.length > 1
                              ? signsDesignFieldErrors[design.id]?.artwork
                              : fieldErrors.artwork
                          }
                        />
                      )}
                    </DesignCard>
                  ))}
                </div>
              ) : isApparelSelected ? (
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
              ) : (
                // One box per design, and the file is bound to its design by
                // closure. Deliberately NOT one multi-file input: `multiple`
                // gives an array with no reliable mapping back to a design,
                // which is the same class of bug as keying form parts by
                // index (CART-PLAN §Per-item artwork).
                <div className="space-y-6">
                  {order.items.map((item, index) => (
                    <DesignCard
                      key={item.id}
                      index={index}
                      total={order.items.length}
                      onRemove={() => removeDesign(item.id)}
                    >
                      <UploadBox
                        onFileSelected={(file) =>
                          handleArtworkUpload(file, item.id)
                        }
                        fileName={item.artwork.file?.name || null}
                        fileSizeBytes={item.artwork.file?.size ?? null}
                        directUploadEnabled={directUploadEnabled}
                        previewUrl={itemPreviews[item.id] || null}
                        error={itemFieldErrors[item.id]?.artwork}
                      />

                      {/* Kiosk only. On the website the customer is already on
                          the device holding their files; at the counter the
                          artwork is on a phone the kiosk cannot reach, which
                          is the whole reason this exists. */}
                      {kiosk.enabled && !item.artwork.file && (
                        <ArtworkHandoff
                          onFileReceived={(file) =>
                            handleArtworkUpload(file, item.id)
                          }
                        />
                      )}

                      {/* Under the box the file was just dropped into.
                          A die cut follows the edge of the ARTWORK, and that
                          edge comes from the file's transparency — so a JPEG,
                          or a PNG flattened onto white, cuts as a rectangle.
                          The customer finds out here, while they can still do
                          something about it, instead of from a proof that
                          looks nothing like the sticker they pictured. */}
                      {item.artwork.file &&
                        item.shape === "Die Cut" &&
                        itemAnalyses[item.id]?.hasTransparentEdges === false && (
                          <BackgroundRemovalControl
                            active={Boolean(knockoutWanted[item.id])}
                            ready={Boolean(itemKnockouts[item.id])}
                            busy={knockoutBusyId === item.id}
                            error={itemKnockoutErrors[item.id]}
                            originalUrl={itemPreviews[item.id] || null}
                            knockoutUrl={
                              itemKnockouts[item.id]?.previewUrl ?? null
                            }
                            onToggle={(wanted) =>
                              toggleBackgroundRemoval(item.id, wanted)
                            }
                          />
                        )}
                    </DesignCard>
                  ))}
                </div>
              )}

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
                heardAbout={order.customer.heardAbout}
                newsletterOptIn={order.customer.newsletterOptIn}
                onChange={(updates) => updateCustomer(updates)}
                errors={{
                  customerName: fieldErrors.customerName,
                  email: fieldErrors.customerEmail,
                }}
                prefilledFromLastOrder={offerRemembered && rememberedApplied}
                onClearRemembered={() => {
                  forgetCustomer();
                  // Clear the boxes too. Telling somebody "not you? clear it"
                  // and then leaving the previous person's name on screen
                  // would be the worst of both.
                  updateCustomer({
                    customerName: "",
                    company: "",
                    email: "",
                    phone: "",
                  });
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

        {/* Renders only when there are real reviews to show. An empty array is
            a valid shipping state — see lib/reviews.ts. The site says nothing
            about what customers think until it can quote someone who actually
            said it. */}
        {reviews.length > 0 && (
          <section
            aria-labelledby="reviews-heading"
            className="mt-12 border border-[var(--rule)] bg-white p-6 sm:p-8"
          >
            <p className="eyebrow">What our customers say</p>

            {/* The shop's own words, from gorillasalem.com. Its confidence
                shows through competence rather than hype, so the heading
                claims nothing the reviews below do not already prove. */}
            <h2
              id="reviews-heading"
              className="mt-2 max-w-2xl text-head font-bold tracking-display text-[var(--ink-black)]"
            >
              Quality work, no drama.
            </h2>

            <p className="mt-2 max-w-2xl text-fine text-[var(--ink-muted)]">
              Printed in Salem for schools, bands, restaurants, museums and
              neighbours down the street — and reviewed by them afterwards.
            </p>

            {/* items-start so each card is the height of its own review.
                Stretching them to match the tallest in the row left a short
                review sitting in a mostly empty box, which reads as a
                rendering fault rather than as a short review. */}
            <ul className="mt-6 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.map((review) => (
                <li
                  key={`${review.author}-${review.quote.slice(0, 24)}`}
                  className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5"
                >
                  {review.rating !== undefined && (
                    <p className="mb-3 flex items-baseline gap-2">
                      {/* Mono figure first, so the rating is carried by a
                          value and not only by a row of glyphs. Stars in INK
                          BLACK rather than an invented gold — there is no
                          amber in the palette and this is not the place to
                          add one. */}
                      <span className="spec text-spec text-[var(--ink-muted)]">
                        {review.rating.toFixed(1)}
                      </span>
                      <span
                        aria-hidden
                        className="text-fine tracking-[0.1em] text-[var(--ink-black)]"
                      >
                        {"★".repeat(Math.round(review.rating))}
                      </span>
                      <span className="sr-only">
                        {review.rating} out of 5 stars
                      </span>
                    </p>
                  )}

                  {/* whitespace-pre-line: reviews are quoted exactly as
                      written, and some were written across several lines.
                      Collapsing them would be a small edit to someone else's
                      words, which is the one thing this section must not do. */}
                  <blockquote className="whitespace-pre-line text-fine leading-6 text-[var(--ink-black)]">
                    &ldquo;{review.quote}&rdquo;
                  </blockquote>

                  <figcaption className="mt-4 border-t border-[var(--rule)] pt-3">
                    <span className="block text-fine font-bold text-[var(--ink-black)]">
                      {review.author}
                    </span>
                    {/* Named, because an unsourced quote is marketing and a
                        sourced one is evidence. */}
                    <span className="spec mt-1 block text-spec uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                      via {review.source}
                    </span>
                  </figcaption>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 border border-[var(--rule)] bg-white p-6 text-center">
          <p className="eyebrow">
            Gorilla Salem
          </p>
          <p className="mt-2 text-lg font-bold text-[var(--ink-black)]">
            {/* Footer copy, shown on every step in every flow — including step
                one, where nothing has been ordered, quoted or paid for. Says
                "every job" rather than naming a transaction stage it cannot
                know, and keeps the promise it was making: a human looks at
                the work. */}
            Custom printing, local service, real people reviewing every job.
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--ink-muted)]">
            Salem, Massachusetts •{" "}
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
