export type StickerOrder = {
  product: string;
  quantity: number;
  size: string;
  shape: string;
  material: string;
  finish: string;
  shipping: string;
  shippingPrice: number;
  stickerPrice: number;
  total: number;
  needBy: string;
  deadlineType: string;
  artwork: File | null;
};

export const defaultOrder: StickerOrder = {
  product: "Die Cut Stickers",
  quantity: 500,
  size: '3" × 3"',
  shape: "Die Cut",
  material: "White Vinyl",
  finish: "Matte",
  shipping: "Standard",
  shippingPrice: 12,
  stickerPrice: 156,
  total: 156,
  needBy: "",
  deadlineType: "Firm",
  artwork: null,
};