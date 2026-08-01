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
];

// Parked while apparel launches small — tees and hoodies only. Add back by
// moving an entry into apparelCatalogItems above; the styles are verified.
//   Classic Crewneck  Sweatshirts  style "372"   Gildan 18000 Heavy Blend
//   Long Sleeve Tee   Long Sleeves style "135"   Gildan 2400 Ultra Cotton
//   Youth Soft Tee    Youth        style "10628" Bella+Canvas 3001YCVC

export const apparelCatalogStyles = apparelCatalogItems.map((item) => item.style);
