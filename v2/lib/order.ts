import { Order } from "../types/order";

export const defaultOrder: Order = {
  customer: {
    customerName: "",
    company: "",
    email: "",
    phone: "",
    notes: "",
  },
  product: {
    type: "Custom Decals",
    quantity: 100,
    size: '3"',
    shape: "Die Cut",
    material: "Gloss White Vinyl",
    finish: "Gloss",
  },
  artwork: {
    file: null,
  },
  production: {
    needBy: "",
    deadlineType: "Flexible",
  },
  pricing: {
    stickerPrice: 0,
    shippingPrice: 12,
    total: 12,
  },
};
