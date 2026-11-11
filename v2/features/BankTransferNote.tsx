/**
 * THE BANK-TRANSFER LINE — Gabe's cash-discount decision, 2026-11-11.
 *
 * Every price on the site is retail. A customer who pays by bank transfer
 * (ACH) on the payment page is refunded the 3% in it after the payment clears.
 * There is no card fee and nothing is added at checkout, so this is phrased as
 * what the customer SAVES, never as a charge on the other method
 * (Massachusetts allows a discount for cash and bans a card surcharge — see
 * lib/retail.ts).
 *
 * The amount is `achRefund` from lib/tax.ts's QuoteTotals — the same figure
 * the shop email and the Printavo note carry, so the three cannot disagree.
 * Renders nothing when there is nothing priced.
 */
export function BankTransferNote({ refund }: { refund: number }) {
  if (!(refund > 0)) return null;

  return (
    <p
      data-ach-refund={refund.toFixed(2)}
      className="mt-1 text-fine font-medium text-[var(--ink-muted)]"
    >
      Pay by bank transfer (ACH) and we refund ${refund.toFixed(2)} once it
      clears.
    </p>
  );
}
