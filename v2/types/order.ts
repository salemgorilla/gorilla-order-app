export type DeadlineType = "Firm" | "Flexible";

export type DeliveryMethod = "Pickup" | "Ship";

export type Customer = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
};

export type Product = {
  type: string;
  quantity: number;
  size: string;
  shape: string;
  material: string;
  finish: string;
  // Preview/production placement of the art on the decal (0–100).
  // artScale = how large the art is; artMargin = die-cut border / shape margin.
  artScale: number;
  artMargin: number;
  // Customer confirms their artwork includes a magenta line marking the cut edge.
  magentaCutLine: boolean;
};

export type Artwork = {
  file: File | null;
};

export type Production = {
  needBy: string;
  deadlineType: DeadlineType;
  deliveryMethod: DeliveryMethod;
};

export type Pricing = {
  stickerPrice: number;
  shippingPrice: number;
  total: number;
};

export type Order = {
  customer: Customer;
  product: Product;
  artwork: Artwork;
  production: Production;
  pricing: Pricing;
};