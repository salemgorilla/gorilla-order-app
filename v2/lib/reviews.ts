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
  /** The review text, exactly as written. */
  quote: string;
  /** The reviewer's name as it appears publicly on the review. */
  author: string;
  /**
   * Where it was left, e.g. "Google". Shown to the customer, because an
   * unsourced quote on a wall is marketing and a sourced one is evidence.
   */
  source: string;
};

export const reviews: Review[] = [
  // Paste real reviews here. Example of the shape — delete this comment, do
  // not uncomment it and edit the text into something plausible:
  //
  // {
  //   quote: "...exactly what they wrote, nothing added or trimmed...",
  //   author: "First L.",
  //   source: "Google",
  // },
];
