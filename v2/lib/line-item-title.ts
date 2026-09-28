/**
 * What each line on the Printavo invoice is CALLED.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * Every row led with "Design 1", "Design 2". That is the design's position in
 * a cart and nothing else: it says which row you are looking at and nothing
 * about which job. Gabe, 2026-09-28: "I would like the name of each line item
 * to be named either after the file name uploaded for that file, or a short
 * descriptor to denote the job is identified properly."
 *
 * The file name is already in the payload for both flows that have one —
 * `artworkFileName` on a sticker item, `fileName` on a signs design — and was
 * being used only in the shop email. The shop is reading the Printavo job,
 * not the email, when it goes to make the thing.
 *
 * ── THE FILE NAME IS CUSTOMER-SUPPLIED TEXT ON AN INVOICE ─────────────────
 * Which makes this more than formatting. A Printavo line description is
 * MULTI-LINE — the spec sits under the title on its own lines — so a file
 * name containing a newline would forge a spec line on a real invoice:
 *
 *     my-logo
 *     Size: 12in x 12in        <- typed by the customer, not by the shop
 *
 * So every control character goes, the result is one line, and it is capped.
 * `/api/quote` is public and the file name arrives from the browser.
 *
 * ── UNIQUENESS IS LOAD-BEARING ────────────────────────────────────────────
 * "Design N" was doing a second job: keeping rows distinguishable. Two
 * identical designs once produced byte-identical rows the shop could not tell
 * apart (CART-PLAN bug 3), and two designs can easily share a file name — or
 * have none at all. Signs rows make this sharper: their itemNumber is the
 * PRODUCT, so two banners in one cart carry the same number and the
 * description is the only thing separating them.
 *
 * So on a multi-design order the design number is still there, after the
 * name. A single-design order does not need it and does not get it.
 */

/** Longer than this and it stops being a title on an invoice line. */
export const MAX_TITLE_LENGTH = 60;

/**
 * A file name reduced to something worth printing, or null.
 *
 * Strips any directory part, drops the extension, turns separators into
 * spaces and collapses whitespace. Returns null when nothing usable is left,
 * so the caller falls back rather than printing an empty title.
 */
export function titleFromFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  // Control characters first, before anything else looks at the string: a
  // newline here would forge a spec line, and a \r would hide the rest of
  // the title from anyone reading the invoice.
  const flattened = value.replace(/[\u0000-\u001f\u007f]/g, " ");

  // Both separators — a Windows client sends backslashes, and some browsers
  // send a relative path rather than a bare name.
  const base = flattened.split(/[\\/]/).pop() ?? "";

  // Drop the extension, but only a real-looking one: "v2.1 logo" must keep
  // its ".1", and a name that is ALL extension has nothing to drop.
  const withoutExtension = base.replace(/\.[A-Za-z0-9]{1,5}$/, "");

  const cleaned = (withoutExtension || base)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  return cleaned.length > MAX_TITLE_LENGTH
    ? `${cleaned.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

/**
 * The line's title: the customer's file name where there is one, a short
 * spec descriptor where there is not, and the design number when the order
 * has more than one design.
 */
export function lineItemTitle(input: {
  /** `artworkFileName` on a sticker item, `fileName` on a signs design. */
  fileName?: unknown;
  /** Short spec descriptor, used when no usable file name came through. */
  fallback: string;
  /** 1-based position in the cart. */
  position: number;
  /** How many designs the order carries. */
  total: number;
}): string {
  const named = titleFromFileName(input.fileName);
  const fallback = String(input.fallback || "").trim();
  const base = named || fallback || `Design ${input.position}`;

  // One design needs no number. More than one, and the number is what keeps
  // two rows from reading identically when the names match or are absent.
  return input.total > 1 ? `${base} (Design ${input.position})` : base;
}

/** "3in x 3in Die Cut Sticker" — what a sticker row is called with no file. */
export function stickerFallbackTitle(spec: {
  widthInches?: unknown;
  heightInches?: unknown;
  size?: unknown;
  shape?: unknown;
}): string {
  const width = Number(spec.widthInches) || 0;
  const height = Number(spec.heightInches) || 0;

  const size =
    width > 0 && height > 0
      ? `${width}in x ${height}in`
      : String(spec.size || "").trim();

  const shape = String(spec.shape || "").trim();

  return [size, shape, "Sticker"].filter(Boolean).join(" ");
}

/** "Vinyl Banner 72in x 36in" — what a signs row is called with no file. */
export function signsFallbackTitle(design: {
  signType?: unknown;
  size?: unknown;
}): string {
  const type = String(design.signType || "").trim() || "Sign";
  const size = String(design.size || "").trim();

  return [type, size].filter(Boolean).join(" ");
}
