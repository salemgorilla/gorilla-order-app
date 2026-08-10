/**
 * How the customer found the shop.
 *
 * Marketing attribution, NOT order data. Nothing downstream prices, schedules
 * or produces anything from this — it exists so the shop can tell which of
 * its listings actually bring work in, which is the question a print shop
 * cannot answer from Printavo alone.
 *
 * Sentence case on the labels, per the accessibility floor in
 * DESIGN-SYSTEM.md §5; the proper nouns keep their capitals because that is
 * how those names are spelt, not because they are being shouted.
 */
export const HEARD_ABOUT_OPTIONS = [
  "Word of mouth",
  "Google",
  "Instagram",
  "Yelp",
  "Facebook",
  "Discovery Map",
] as const;

export type HeardAboutOption = (typeof HEARD_ABOUT_OPTIONS)[number];
