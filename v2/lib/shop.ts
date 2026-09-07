/**
 * The institution — one place the shop says where and what it is.
 *
 * Provenance is spec furniture: the header, the footer and the pickup
 * notice all point at these strings, so the address cannot drift between
 * surfaces the way copy pasted three times eventually does. Real values
 * only; a code, a street or a number that appears here has to exist.
 */
export const SHOP = {
  name: "Gorilla Salem",
  street: "47 Canal Street",
  city: "Salem",
  state: "Massachusetts",
  stateCode: "MA",
  email: "quote@gorillasalem.com",
} as const;
