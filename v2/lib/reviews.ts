/**
 * Customer reviews shown in the footer.
 *
 * ── READ THIS BEFORE ADDING ANYTHING ──────────────────────────────────────
 *
 * Every entry must be a REAL review, quoted VERBATIM, by a real person who
 * actually wrote it. Copy them straight out of the Google Business Profile
 * (Google Business Profile → Reviews → copy the text and the reviewer's name
 * as shown). Do not tidy the grammar, do not merge two reviews into one, do
 * not write one "in the spirit of" what customers say.
 *
 * This is not fussiness. Testimonials on a commercial site are regulated —
 * the FTC's endorsement rules cover fabricated, misattributed and materially
 * edited reviews, and the exposure lands on the shop, not on whoever typed
 * them. A misquoted review is worse than no review.
 *
 * If you cannot copy it from the source, it does not go in this file.
 *
 * The footer section renders only when this array has entries, so leaving it
 * empty is a valid, shipping state — the site simply does not claim anything
 * it cannot back up.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type Review = {
  /**
   * The review text, exactly as written — including line breaks, and
   * including anything you would rather it did not say. The card renders
   * whitespace as written, so a multi-line review keeps its shape.
   */
  quote: string;
  /** The reviewer's name as it appears publicly on the review. */
  author: string;
  /**
   * Where it was left, e.g. "Google". Shown to the customer, because an
   * unsourced quote on a wall is marketing and a sourced one is evidence.
   */
  source: string;
  /** Stars out of five, as given. Omit rather than guess. */
  rating?: number;
};

/**
 * Transcribed from the shop's Google Business Profile, 2026-08-09.
 *
 * Two of these contain typos the reviewers made — "greet experience" and "all
 * thing retail wrap needs". They are left exactly as written. Correcting
 * someone's words and still presenting them inside quotation marks as that
 * person's review is the misquoting this file exists to prevent, and it is
 * the kind of edit the FTC's endorsement rules actually name.
 *
 * If a typo bothers you, drop the review. Do not fix it.
 */
export const reviews: Review[] = [
  {
    quote:
      "Timely and communicative! They also have such great attention to detail. Will be using them for all thing retail wrap needs!",
    author: "Rachel Buffer",
    source: "Google",
    rating: 5,
  },
  {
    quote:
      "We had a greet experience with Gorilla Printing!! We needed just 12 hats for a polar plunge and they were able to make them quickly, with great communication, and most importantly - they came out great!!! Thank you for all of your help!",
    author: "Natalia Laskaris",
    source: "Google",
    rating: 5,
  },
  {
    quote:
      "Got 200 bumper stickers for Citizens' Climate Lobby-Northshore.\nThey came out bright, vivid, quickly, and under-budget.\nLove working locally.\nPlan on working with Gorilla again !!\nThanks guys.....",
    author: "Frank",
    source: "Google",
    rating: 5,
  },
  {
    quote: "Graphics on the window posters we bought were amazing",
    author: "kathleen chisholm",
    source: "Google",
    rating: 5,
  },
];
