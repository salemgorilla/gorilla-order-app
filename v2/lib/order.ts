import { Order, StickerItem } from "../types/order";
import {
  getCartSetupFee,
  getShippingPrice,
  getStickerMaterialPrice,
} from "./pricing";

const initialProduct = {
  type: "Custom Stickers",
  quantity: 100,
  size: '3"',
  // Real dimensions now that the size presets are gone. Must be non-zero:
  // area drives the price, so 0 x 0 would quote the $25 setup and nothing else.
  widthInches: 3,
  heightInches: 3,
  shape: "Die Cut",
  material: "Gloss White Vinyl",
  finish: "Gloss",
  artScale: 80,
  artMargin: 40,
  magentaCutLine: false,
  // Off by default — see Product.artBleed.
  artBleed: false,
};

/**
 * Ids for cart items.
 *
 * Not an array index — form parts are keyed on this (`artwork:${id}`), and an
 * index would rebind every later file to the wrong design the moment someone
 * removes a middle item. Not crypto.randomUUID() either: this runs during the
 * first client render and older Safari on http origins does not have it.
 */
let itemSequence = 0;

export function createStickerItem(
  overrides: Partial<StickerItem> = {}
): StickerItem {
  itemSequence += 1;

  return {
    ...initialProduct,
    id: `design-${itemSequence}-${Math.random().toString(36).slice(2, 8)}`,
    artwork: { file: null },
    ...overrides,
  };
}

// Local pickup by default — Gorilla Salem is a walk-in shop.
const initialDeliveryMethod = "Pickup" as const;

// Price the default selection up front so the very first render shows the real
// decal price instead of $0 (or shipping-only).
const initialStickerPrice = getStickerMaterialPrice(
  initialProduct.quantity,
  initialProduct.material,
  initialProduct.size
);

const initialSetupPrice = getCartSetupFee(1);
const initialShippingPrice = getShippingPrice(initialDeliveryMethod);

export const defaultOrder: Order = {
  customer: {
    customerName: "",
    company: "",
    email: "",
    phone: "",
    notes: "",
    heardAbout: [],
    // Pre-checked by decision. See the note on Customer.newsletterOptIn —
    // the box has to stay obvious and one click from off, which is what earns
    // the default.
    newsletterOptIn: true,
  },
  items: [createStickerItem()],
  artwork: {
    file: null,
  },
  production: {
    needBy: "",
    deadlineType: "Flexible",
    deliveryMethod: initialDeliveryMethod,
  },
  pricing: {
    stickerPrice: initialStickerPrice,
    setupPrice: initialSetupPrice,
    shippingPrice: initialShippingPrice,
    total: initialStickerPrice + initialSetupPrice + initialShippingPrice,
  },
  addOns: [],
  addOnsNote: "",
};
