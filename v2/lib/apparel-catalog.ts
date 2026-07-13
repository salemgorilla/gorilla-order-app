export type ApparelCatalogItem = {
  label: string;
  category: string;
  style: string;
  notes: string;
};

export const apparelCatalogItems: ApparelCatalogItem[] = [
  {
    label: "Starter Tee",
    category: "T-Shirts",
    style: "00760",
    notes: "Known-good S&S API starter garment.",
  },
  {
    label: "Basic Tee",
    category: "T-Shirts",
    style: "2000",
    notes: "Standard budget-friendly tee.",
  },
  {
    label: "Premium Soft Tee",
    category: "T-Shirts",
    style: "3001CVC",
    notes: "Softer retail-style tee option.",
  },
  {
    label: "Classic Hoodie",
    category: "Sweatshirts",
    style: "18500",
    notes: "Classic pullover hoodie.",
  },
  {
    label: "Classic Crewneck",
    category: "Sweatshirts",
    style: "18000",
    notes: "Classic crewneck sweatshirt.",
  },
  {
    label: "Long Sleeve Tee",
    category: "Long Sleeves",
    style: "2400",
    notes: "Standard long sleeve tee.",
  },
  {
    label: "Youth Soft Tee",
    category: "Youth",
    style: "3001YCVC",
    notes: "Youth soft tee option.",
  },
];

export const apparelCatalogStyles = apparelCatalogItems.map((item) => item.style);
