export const apparelCatalog = {
  quantities: [12, 24, 36, 50, 75, 100, 150, 250, 500],
  garmentTypes: ["T-Shirts", "Hoodies", "Crewnecks", "Long Sleeves", "Hats"],
  garmentColors: [
    "Black",
    "White",
    "Heather Gray",
    "Navy",
    "Forest Green",
    "Red",
    "Custom / Not Sure",
  ],
  // Launching small: front and back only. Anything else (left chest, sleeve,
  // tags, hats, custom placement) goes through the special-order request.
  printLocations: ["Front", "Back"],
  inkColors: [
    "1 color",
    "2 colors",
    "3 colors",
    "4 colors",
    "5+ colors / Full color / Not sure",
  ],
};

export const defaultApparelQuote = {
  garmentType: "T-Shirts",
  quantity: 24,
  garmentColor: "Black",
  printLocations: ["Front"],
  inkColors: "1 color",
  sizeBreakdown: "",
  /**
   * The customer needs something outside the simple menu (a different garment,
   * another print location, embroidery, hats…). Turns the whole submission into
   * a "NEED TO QUOTE" special order instead of an online estimate.
   */
  specialOrder: false,
  specialOrderNotes: "",
};

export type ApparelQuote = typeof defaultApparelQuote;
