export type ApparelCatalogItem = {
  label: string;
  category: string;
  style: string;
  notes: string;
};

// `style` is the S&S **styleID** (S&S's own numeric id, verified against the
// live API). The products endpoint accepts either the styleID (e.g. "39") or
// the zero-padded partNumber (e.g. "00760"); manufacturer model names like
// "2000" or "3001CVC" do NOT work and return 404. To add a garment, look up
// its styleID in the S&S catalog (or the /v2/styles/ endpoint) — do not paste
// the manufacturer model number.
export const apparelCatalogItems: ApparelCatalogItem[] = [
  {
    label: "Starter Tee",
    category: "T-Shirts",
    style: "39",
    notes: "Gildan 2000 Ultra Cotton — budget-friendly staple tee.",
  },
  {
    label: "Premium Soft Tee",
    category: "T-Shirts",
    style: "7584",
    notes: "Bella+Canvas 3001CVC — softer retail-style tee.",
  },
  {
    label: "Classic Hoodie",
    category: "Sweatshirts",
    style: "395",
    notes: "Gildan 18500 Heavy Blend — pullover hoodie.",
  },
  {
    label: "Classic Crewneck",
    category: "Sweatshirts",
    style: "372",
    notes: "Gildan 18000 Heavy Blend — crewneck sweatshirt.",
  },
  {
    label: "Long Sleeve Tee",
    category: "Long Sleeves",
    style: "135",
    notes: "Gildan 2400 Ultra Cotton — long sleeve tee.",
  },
  {
    label: "Youth Soft Tee",
    category: "Youth",
    style: "10628",
    notes: "Bella+Canvas 3001YCVC — youth CVC jersey tee.",
  },
];

export const apparelCatalogStyles = apparelCatalogItems.map((item) => item.style);
