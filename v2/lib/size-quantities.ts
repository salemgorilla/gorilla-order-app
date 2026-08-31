/**
 * The apparel size grid derives its rows from the SELECTED COLOR's size run
 * (page.tsx, sizeOptionsForBreakdown), but the quantities the customer types
 * live in their own state — so when the colour changes, any count entered
 * for a size the new colour does not come in falls out of the grid while
 * still counting toward the total.
 *
 * Found by driving the live catalog: type M-12, L-12 on a Starter Tee, then
 * switch to BELLA+CANVAS Heather Marmalade — which S&S stocks only in XS,
 * 3XL and 4XL. The grid shows three rows, all zero; the badge still says
 * "24 shirts"; and the payload would carry a size breakdown the chosen
 * colour cannot be ordered in, with no control left on screen to see or fix
 * the phantom rows. (The always-true reconciliation flag is correct — the
 * quantity IS the grid total — which is exactly why the grid must never
 * hold rows the screen cannot show.)
 *
 * The fix: whenever the colour (directly, or via a product switch) changes,
 * prune the quantities to the sizes the new colour actually offers. Counts
 * for sizes that carry over survive — a customer comparing two colours in
 * the same run keeps their breakdown — and only the impossible rows drop.
 */
export function pruneSizeQuantities(
  quantities: Record<string, number>,
  availableSizeNames: string[]
): { quantities: Record<string, number>; breakdown: string } {
  const available = new Set(availableSizeNames);
  const next: Record<string, number> = {};

  for (const [size, quantity] of Object.entries(quantities)) {
    if (available.has(size) && quantity > 0) {
      next[size] = quantity;
    }
  }

  const breakdown = Object.entries(next)
    .map(([size, quantity]) => `${size}-${quantity}`)
    .join(", ");

  return { quantities: next, breakdown };
}
