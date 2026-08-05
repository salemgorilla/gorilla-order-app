/** Chosen when the customer enters their own width and height. */
export const CUSTOM_STICKER_SIZE = "Custom size";

export const stickerCatalog = {
  // Re-centred 2026-08-04 on how the shop actually sells: real orders are 100,
  // 200 and 500. 250 retired in favour of 200 and 300; 2500/5000 kept but they
  // are rare. 200 previously had no button at all and fell into the custom
  // rule, which priced it at $178 while the 250 button cost $118.
  quantities: [50, 100, 200, 300, 500, 1000, 2500, 5000],
  // 0.5" and 1" added 2026-08-05. Both are on the shop's pricing sheet.
  // NOTE: with no minimum floor these are the cheapest things in the
  // catalogue by a wide margin — see the warning on getStickerPrice.
  sizes: ['0.5"', '1"', '2"', '3"', '4"', '5"', '6"'],
  shapes: ["Die Cut", "Circle", "Square", "Rounded Square"],
  // Clear Vinyl removed 2026-08-04. Its pricing multiplier and its preview
  // rendering are deliberately KEPT — quotes already in Printavo reference it,
  // and dropping them would make an old order reprice or render wrong.
  materials: ["Gloss White Vinyl", "Matte White Vinyl", "Holographic", "Chrome"],
};
