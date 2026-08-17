import { SALES_TAX, estimateSalesTax, isTaxableFlow } from "../../lib/tax";
import type { Order } from "../../types/order";

interface Props {
  /**
   * Typed. This was `any`, which is why it went on compiling against
   * `order.product` after that field stopped existing — it would have failed
   * at runtime instead, in front of a customer.
   */
  order: Order;
}

export default function OrderSummary({ order }: Props) {
  const designs = order.items.length;
  const totalStickers = order.items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0
  );
  // Several designs rarely share one size, so the row names the cart rather
  // than picking one design's size and presenting it as the order's.
  const sizeLabel =
    designs > 1 ? `${designs} designs` : order.items[0].size;

  const uploadedCount = order.items.filter((item) => item.artwork.file).length;

  /**
   * Estimated sales tax, on the GOODS only.
   *
   * The customer used to agree to a number here and meet 6.25% for the first
   * time on the Printavo payment page — on the reference two-design order,
   * $72.70 quietly becoming $77.24.
   *
   * Shipping is excluded because separately stated shipping is not taxable in
   * Massachusetts, and buildPrintavoQuotePlan sends the shipping line with
   * `taxed: false` while goods AND fee lines both carry
   * `taxed: salesTaxRate !== null`. So the taxable base is stickers + setup,
   * which is what makes this row agree with the invoice rather than merely
   * look plausible.
   *
   * isTaxableFlow rather than a hardcoded true: this component is the sticker
   * summary, and clothing is exempt in Massachusetts, so anyone reusing it for
   * apparel needs the exemption to travel with it.
   *
   * ESTIMATE, and labelled as one. estimateSalesTax is documented display-only
   * — Printavo computes the figure that is actually charged. Half-cent totals
   * are not bugs: $241.04 x 6.25% is $15.065, and Printavo may show $15.06
   * while totalling as if $15.07. Do not add compensating logic.
   */
  const taxableSubtotal =
    order.pricing.stickerPrice + order.pricing.setupPrice;
  const estimatedTax = isTaxableFlow("stickers")
    ? estimateSalesTax(taxableSubtotal)
    : 0;
  // Rounded to cents like estimateSalesTax does, because 72.7 + 4.54 is
  // 77.24000000000001 in binary floating point. toFixed(2) would hide that on
  // screen, but a money value should not carry dust it might later pass on.
  const estimatedTotal =
    Math.round((order.pricing.total + estimatedTax) * 100) / 100;

  return (
    <div className=" border border-[var(--rule)] bg-white p-8">
      <p className="eyebrow">
        Review
      </p>

      <h2 className="mt-2 text-head font-bold tracking-display">
        Order Summary
      </h2>

      <div className="mt-8 space-y-4">

        <SummaryRow label="Product" value={order.items[0].type} />

        <SummaryRow
          label="Quantity"
          value={totalStickers.toLocaleString()}
        />

        <SummaryRow
          label="Size"
          value={sizeLabel}
        />

        <SummaryRow
          label="Material"
          value={order.items[0].material}
        />

        <SummaryRow
          label="Finish"
          value={order.items[0].finish}
        />

        <SummaryRow
          label="Need By"
          value={order.production.needBy || "Not entered"}
        />

        <SummaryRow
          label="Delivery"
          value={
            order.production.deliveryMethod === "Ship"
              ? "Ship"
              : "Local Pickup"
          }
        />

        {/* Plain text, no emoji. Order Desk is hairlines and Republic type;
            there is no emoji anywhere else in the system, and a tick is not a
            legible substitute for a count on a multi-design order. */}
        <SummaryRow
          label="Artwork"
          value={
            designs > 1
              ? `${uploadedCount} of ${designs} uploaded`
              : uploadedCount === 1
              ? "Uploaded"
              : "Not uploaded"
          }
        />

      </div>

      {/**
        * Every design's own spec.
        *
        * The Size row above deliberately says "3 designs" rather than passing
        * one design's size off as the order's — but that left the individual
        * sizes appearing NOWHERE. Review is the customer's last chance to catch
        * their own mistake before a payable link is issued, and a two-design
        * order read "Quantity 150 · Size 2 designs" and nothing else.
        *
        * Keyed by design id, never index: ids are what submit keys its form
        * parts on, and an index would renumber every later design the moment
        * one is removed.
        */}
      {designs > 1 && (
        <div className="mt-6 border-t border-[var(--rule)] pt-6">
          <p className="text-fine font-bold text-[var(--ink-muted)]">
            Designs in this order
          </p>

          <ul className="mt-3 space-y-2">
            {order.items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-baseline gap-3 text-fine leading-6"
              >
                <span className="spec shrink-0 text-spec text-[var(--ink-muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span className="text-[var(--ink-black)]">
                  <span className="font-bold">{item.size}</span>
                  {" · "}
                  {item.material}
                  {" · "}
                  {Math.max(0, item.quantity).toLocaleString()}
                  {/* Named, so the shop and the customer can both tell which
                      design is the one still missing a file. */}
                  {item.artwork.file ? (
                    <span className="text-[var(--ink-muted)]">
                      {" · "}
                      {item.artwork.file.name}
                    </span>
                  ) : (
                    <span className="text-[var(--rush-red)]">
                      {" · "}no artwork yet
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="my-8 border-t border-[var(--rule)]" />

      <div className="space-y-3">
        <SummaryRow
          label="Stickers"
          value={`$${order.pricing.stickerPrice.toFixed(2)}`}
        />

        <SummaryRow
          label={
            designs > 1
              ? `Setup (${designs} designs)`
              : "Setup"
          }
          value={`$${order.pricing.setupPrice.toFixed(2)}`}
        />

        <SummaryRow
          label="Shipping"
          value={
            order.pricing.shippingPrice > 0
              ? `$${order.pricing.shippingPrice.toFixed(2)}`
              : "Free (pickup)"
          }
        />

        {estimatedTax > 0 && (
          <SummaryRow
            label={`Estimated ${SALES_TAX.label}`}
            value={`$${estimatedTax.toFixed(2)}`}
          />
        )}
      </div>

      <div className="my-6 border-t border-[var(--rule)] " />

      {/* Tax-inclusive, because showing the tax as a row and then a total that
          excludes it is how the customer meets the real number on the payment
          page instead of here. "Estimated" is the honest word: Printavo
          computes what is actually charged. */}
      <div className="flex justify-between text-lede font-bold">
        <span>{estimatedTax > 0 ? "Estimated total" : "Total"}</span>
        <span>${estimatedTotal.toFixed(2)}</span>
      </div>

      {estimatedTax > 0 && (
        <p className="mt-2 text-fine leading-5 text-[var(--ink-muted)]">
          Tax is estimated at {SALES_TAX.ratePercent}% on the stickers and
          setup. Shipping is not taxable in Massachusetts. Gorilla Salem&rsquo;s
          invoice is the final figure.
        </p>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--ink-muted)]">
        {label}
      </span>

      <span className="font-bold text-right">
        {value}
      </span>
    </div>
  );
}