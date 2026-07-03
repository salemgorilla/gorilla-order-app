export interface Customer {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
}

export interface Product {
  type: string;
  quantity: number;
  size: string;
  material: string;
  finish: string;
}

export interface Artwork {
  file: File | null;
}

export interface Production {
  needBy: string;
  deadlineType: "Firm" | "Flexible";
}

export interface Pricing {
  stickerPrice: number;
  shippingPrice: number;
  total: number;
}

export interface Order {
  customer: Customer;
  product: Product;
  artwork: Artwork;
  production: Production;
  pricing: Pricing;
}