import { Order } from "../types/order";
import { getShippingPrice, getStickerPrice } from "./pricing";

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
};

// Local pickup by default — Gorilla Salem is a walk-in shop.
const initialDeliveryMethod = "Pickup" as const;

// Price the default selection up front so the very first render shows the real
// decal price instead of $0 (or shipping-only).
const initialStickerPrice = getStickerPrice(
  initialProduct.quantity,
  initialProduct.material,
  initialProduct.finish,
  initialProduct.size
);

const initialShippingPrice = getShippingPrice(initialDeliveryMethod);

export const defaultOrder: Order = {
  customer: {
    customerName: "",
    company: "",
    email: "",
    phone: "",
    notes: "",
  },
  product: initialProduct,
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
    shippingPrice: initialShippingPrice,
    total: initialStickerPrice + initialShippingPrice,
  },
  addOns: [],
  addOnsNote: "",
};
