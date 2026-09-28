/**
 * What the shop's print file is CALLED.
 *
 * Gabe, 2026-09-28, asking for the artwork file he prints from to identify
 * itself: `GORILLA-DECAL-1: 2.5"x2.5" - 100 pcs`. Until now it arrived as
 * `design-1-logo.png` — the cart position and whatever the customer's
 * software called the export, which says nothing about what to cut.
 *
 * ── TWO CHARACTERS IN THE REQUESTED FORMAT CANNOT BE IN A FILENAME ────────
 * This is the whole reason this is a function and not a template string.
 *
 *   :   forbidden on Windows, and a path separator in older macOS
 *   "   forbidden on Windows, AND it terminates the quoted value in
 *       `Content-Disposition: attachment; filename="..."`, so a mail client
 *       reading the header sees the name end early
 *
 * The shop runs Windows tooling (Accurip, Separation Studio), so a file
 * named with either would be mangled or refused at the moment it is saved —
 * which is the one moment it has to work. Both are substituted for something
 * that reads the same to a human:
 *
 *   GORILLA-DECAL-1 - 2.5in x 2.5in - 100 pcs.png
 *
 * ── THE SKU IS THE ONE ON THE INVOICE ─────────────────────────────────────
 * Passed in rather than rebuilt, so the file the shop prints from and the
 * line the customer is billed for carry the same code. That is the whole
 * point of the name: lay the file beside the invoice and they match.
 */

/** Windows' reserved set, plus the quote that breaks the mail header. */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

/** Long names get truncated by mail clients and archives; stay well under. */
export const MAX_PRINT_NAME_LENGTH = 120;

/** `2.5in x 2.5in`, or the customer's own size string when there are no dims. */
export function describePrintSize(spec: {
  widthInches?: unknown;
  heightInches?: unknown;
  size?: unknown;
}): string {
  const width = Number(spec.widthInches) || 0;
  const height = Number(spec.heightInches) || 0;

  // Trim trailing zeros: 2.50 x 2.50 is noise, 2.5 x 2.5 is the size.
  const trim = (value: number) => String(Number(value.toFixed(3)));

  if (width > 0 && height > 0) return `${trim(width)}in x ${trim(height)}in`;

  // No dimensions: fall back to whatever the size field says, with the
  // inch marks spelled out for the same reason as above.
  return String(spec.size || "")
    .replace(/[″”"]/g, "in")
    .trim();
}

/** The file extension, including the dot, or "" — taken from the real file. */
export function extensionOf(fileName: unknown): string {
  const match = String(fileName ?? "").match(/(\.[A-Za-z0-9]{1,5})$/);
  return match ? match[1] : "";
}

/**
 * `GORILLA-DECAL-1 - 2.5in x 2.5in - 100 pcs.png`
 *
 * Every part is optional in the sense that a missing one is dropped rather
 * than printed empty — a file called "GORILLA-DECAL-1 -  - 100 pcs" helps
 * nobody. The extension always comes from the customer's real file, because
 * the shop has to be able to open it.
 */
export function printFileName(input: {
  /** The invoice SKU for this design — GORILLA-DECAL-1, GORILLA-SIGN-... */
  sku: string;
  /** The customer's original file name, for its extension. */
  originalName: unknown;
  widthInches?: unknown;
  heightInches?: unknown;
  size?: unknown;
  quantity?: unknown;
}): string {
  const size = describePrintSize(input);
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));

  const parts = [
    String(input.sku || "").trim(),
    size,
    quantity > 0 ? `${quantity} pcs` : "",
  ].filter(Boolean);

  const stem = parts
    .join(" - ")
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A trailing dot makes a Windows file unopenable, and a leading one
    // hides it on unix.
    .replace(/^\.+|\.+$/g, "")
    .slice(0, MAX_PRINT_NAME_LENGTH);

  const extension = extensionOf(input.originalName);

  // Nothing usable to build from: keep the customer's name rather than
  // inventing a file called "".
  if (!stem) return String(input.originalName || "artwork");

  return `${stem}${extension}`;
}
