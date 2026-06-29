export const stickerPricing = {
  productId: "stickers",
  productName: "Custom Stickers",
  quantities: [50, 100, 250, 500, 1000, 2500, 5000],
  shapes: [
    { id: "circle", label: "Circle", sub: "Classic round", multiplier: 1 },
    { id: "square", label: "Square", sub: "Clean edges", multiplier: 1 },
    { id: "rectangle", label: "Rectangle", sub: "Great for labels", multiplier: 1 },
    { id: "die-cut", label: "Die Cut", sub: "Cut to shape", multiplier: 1.18 },
    { id: "kiss-cut", label: "Kiss Cut", sub: "Easy peel backing", multiplier: 1.12 },
    { id: "oval", label: "Oval", sub: "Soft shape", multiplier: 1.05 }
  ],
  sizes: [
    { id: "2x2", label: "2 in × 2 in", sub: "Small logo", base: { 50: 24, 100: 34, 250: 58, 500: 95, 1000: 168, 2500: 365, 5000: 650 } },
    { id: "3x3", label: "3 in × 3 in", sub: "Most popular", base: { 50: 29, 100: 41, 250: 72, 500: 116, 1000: 198, 2500: 445, 5000: 795 } },
    { id: "4x4", label: "4 in × 4 in", sub: "Bold handout", base: { 50: 36, 100: 54, 250: 92, 500: 148, 1000: 255, 2500: 585, 5000: 1040 } },
    { id: "5x5", label: "5 in × 5 in", sub: "Large sticker", base: { 50: 48, 100: 69, 250: 118, 500: 190, 1000: 325, 2500: 760, 5000: 1375 } }
  ],
  materials: [
    { id: "white-vinyl", label: "White Vinyl", sub: "Best everyday choice", multiplier: 1 },
    { id: "clear-vinyl", label: "Clear Vinyl", sub: "+15%", multiplier: 1.15 },
    { id: "holographic", label: "Holographic", sub: "+35%", multiplier: 1.35 },
    { id: "chrome", label: "Chrome", sub: "+30%", multiplier: 1.3 }
  ],
  finishes: [
    { id: "gloss", label: "Gloss", sub: "Shiny finish", multiplier: 1 },
    { id: "matte", label: "Matte", sub: "Soft finish", multiplier: 1.05 },
    { id: "uv", label: "UV Laminate", sub: "Extra durable", multiplier: 1.12 }
  ]
};
