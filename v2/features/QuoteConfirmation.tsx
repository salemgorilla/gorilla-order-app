"use client";

import Header from "../components/Header";
import KioskPickupCard from "../components/kiosk/KioskPickupCard";
import { useKiosk } from "../components/kiosk/KioskProvider";
import type { Order } from "../types/order";
import type { ApparelQuote } from "../lib/apparel";
import { describeAssumedMix } from "../lib/apparel-blend";
import type { ApparelPricingResult } from "../lib/apparel-pricing";
import type { QuoteConfirmation, SsCatalogColor } from "./types";
import { SALES_TAX, getSignsTotals, getStickerTotals } from "../lib/tax";
import { formatBytes } from "../lib/upload-limits";
import { canOfferTracker, getTrackUrl } from "../lib/order-status";
import {
  getSignProduct,
  getSignSizeLabel,
  type SignsQuote,
} from "../lib/signs";

type Props = {
  quoteConfirmation: QuoteConfirmation | null;
  order: Order;
  isApparelSubmitted: boolean;
  /** Request-flow submissions confirm the three questions asked, not the
      configurator fields the flow never showed. */
  isApparelRequest: boolean;
  /**
   * What the apparel figure stands on, unchanged from the review screen:
   * the handoff's rule is that the assumption lives on the same screen as
   * the number, and this screen still shows the number.
   */
  apparelEstimateBasis: "assumed" | "exact";
  isSignsSubmitted: boolean;
  signsQuote: SignsQuote;
  /** Null when the signs job could not be priced online. */
  signsTotal: number | null;
  apparelQuote: ApparelQuote;
  selectedGarmentLabel: string;
  selectedSsColor: SsCatalogColor | null;
  apparelPricing: ApparelPricingResult;
  unitPrice: number;
  copyStatus: "idle" | "copied" | "error";
  emailHref: string;
  onCopy: () => void;
  onStartNew: () => void;
  onBackToBuilder: () => void;
};

export default function QuoteConfirmationScreen({
  quoteConfirmation,
  order,
  isApparelSubmitted,
  isApparelRequest,
  apparelEstimateBasis,
  isSignsSubmitted,
  signsQuote,
  signsTotal,
  apparelQuote,
  selectedGarmentLabel,
  selectedSsColor,
  apparelPricing,
  unitPrice,
  copyStatus,
  emailHref,
  onCopy,
  onStartNew,
  onBackToBuilder,
}: Props) {
  // One derivation, shared with the review card, the Order Summary and the
  // sticky estimate bar. See getQuoteTotals in lib/tax — four surfaces showed
  // this figure and only one of them had tax.
  const stickerTotals = getStickerTotals(order.pricing);

  /**
   * Tax-inclusive, like every other surface — and like the sticker branch
   * directly below, whose comment already names showing the pre-tax figure
   * here as "the whole defect".
   *
   * This showed `signsTotal` raw. The estimate bar and the review card both
   * say $188.06 with a tax line; the customer pressed Request Quote on that
   * number and this screen immediately answered $177.00 — an $11.06 drop
   * that reads as a discount until the invoice arrives at $188.06, at which
   * point the confirmation they screenshotted reads as the shop marking the
   * price up. Signs are invoiced rather than paid on the spot, so this
   * screen is the LAST number they hold until that invoice.
   */
  const signsTotals = signsTotal !== null ? getSignsTotals({ total: signsTotal }) : null;

  /**
   * Read here rather than threaded in as a prop, so there is one way of
   * knowing this is a kiosk — the same context every other kiosk behaviour
   * uses. The default is the WEBSITE, so a screen that forgets to consider
   * the counter behaves exactly as it always has.
   */
  const kiosk = useKiosk();

  /**
   * Only offer the tracker when there is something for it to find.
   *
   * /track queries Printavo, and createPrintavoQuote is best-effort — it
   * returns { created: false } rather than failing the submission, so a real
   * order can exist in the shop's email with nothing for /track to match.
   * Same predicate the confirmation email and the kiosk card ask.
   */
  const showTracker = canOfferTracker({
    quoteNumber: quoteConfirmation?.quoteNumber,
    printavoCreated: Boolean(quoteConfirmation?.printavoCreated),
  });

  // Absent for signs and apparel, and absent for stickers whenever Printavo
  // was unreachable — in every one of those cases the screen falls back to
  // "we'll be in touch", which is still a real, submitted order.
  const checkout = quoteConfirmation?.checkout;
  // Narrowed to a real URL rather than a boolean, so the pay block cannot
  // render without somewhere to send the customer.
  const payUrl = checkout?.ready ? checkout.payUrl : undefined;
  const payAmount = checkout?.amount;
  const canPayNow = Boolean(payUrl);

  return (
    // Marks "the order is sent" in the DOM. The kiosk watches for this to
    // switch to its shorter clear-down timer; the flow itself stays unaware a
    // kiosk exists, which is what keeps the website and the kiosk on one
    // shared code path rather than two that drift.
    <main data-quote-confirmed="true" className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />

      <div className="mx-auto grid min-h-[80vh] max-w-5xl place-items-center px-4 py-10 sm:px-8 sm:py-16">
        <div className="w-full border border-[var(--rule)] bg-white p-6 sm:p-10">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center bg-[var(--gorilla-green)] text-display text-white">
              ✓
            </div>

            <p className="mt-8 text-fine font-bold uppercase tracking-eyebrow text-[var(--rush-red)]">
              {canPayNow ? "Ready to pay" : "Quote Received"}
            </p>

            <h1 className="mt-3 text-hero font-bold tracking-display text-[var(--ink-black)]">
              {canPayNow
                ? "Your quote is priced and ready."
                : "Your request was sent to Gorilla Salem."}
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lede leading-8 text-[var(--ink-muted)]">
              {canPayNow
                ? "Sticker pricing is set, so there's nothing to wait for. Pay below and we'll send a proof before anything goes to print."
                : "We received your quote request. Gorilla Salem will review your artwork, timeline, and details before production."}
            </p>
          </div>

          {payUrl && (
            <div className="mt-8 border-2 border-[var(--ink-black)] bg-[var(--surface-ok)] p-6 text-center">
              <a
                href={payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-8 py-5 text-lede font-bold text-white transition-colors duration-[120ms] ease-linear hover:bg-[var(--paper)] hover:text-[var(--gorilla-green)] sm:w-auto"
              >
                Pay now
                {typeof payAmount === "number" && payAmount > 0
                  ? ` — $${payAmount.toFixed(2)}`
                  : ""}
              </a>

              <p className="mt-4 text-fine font-bold leading-6 text-[var(--ink-black)]">
                Includes {SALES_TAX.label}. We&rsquo;ll send a proof before
                printing — if we can&rsquo;t print your artwork, you get a full
                refund.
              </p>

              <p className="spec mt-2 text-spec text-[var(--ink-muted)]">
                Payment link also emailed to you
              </p>
            </div>
          )}

          {/* Artwork that did NOT travel with this quote. Above everything
              else that is merely informational, because on 25 Aug a customer
              walked away from this exact screen believing his 10.6 MB file
              had been sent — it had been silently dropped, the recovery note
              went only to the shop, and the job was lost to the deadline.
              For signs and apparel this screen is the customer's ONLY
              channel; there is no email to repeat it in.

              The copy does three things on purpose: names the file so they
              know which one, gives the fix in one action, and says the rest
              arrived so they do not resubmit the whole order. */}
          {(quoteConfirmation?.droppedArtwork?.length ?? 0) > 0 && (
            <div
              role="alert"
              className="mt-8 border-l-4 border-[var(--rush-red)] bg-[var(--surface-warn)] p-6"
            >
              <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--rush-red)]">
                One more step — your artwork
              </p>

              {quoteConfirmation!.droppedArtwork!.map((file) => (
                <p
                  key={file.id}
                  className="mt-3 text-body font-bold leading-7 text-[var(--ink-black)]"
                >
                  We couldn&rsquo;t bring{" "}
                  <span className="spec">{file.name}</span>
                  {" along with the quote — it’s "}
                  {formatBytes(file.size)}, more than this form can carry.
                </p>
              ))}

              <p className="mt-3 text-fine font-bold leading-6 text-[var(--ink-black)]">
                Email the file to{" "}
                <a
                  className="underline decoration-1 underline-offset-2"
                  href="mailto:quote@gorillasalem.com"
                >
                  quote@gorillasalem.com
                </a>{" "}
                with your quote number &mdash; the Open Gmail Draft button
                below starts that message for you. Everything else arrived:
                don&rsquo;t resubmit the order.
              </p>
            </div>
          )}

          <div className="mt-8 bg-[var(--shirt-blank)] p-6 text-center">
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Quote Number
            </p>

            <p className="mt-2 text-section font-bold tracking-display text-[var(--gorilla-green)]">
              {quoteConfirmation?.quoteNumber || "Pending"}
            </p>

            <p className="mt-2 text-fine font-medium text-[var(--ink-muted)]">
              Submitted{" "}
              {quoteConfirmation?.receivedAt
                ? new Date(quoteConfirmation.receivedAt).toLocaleString()
                : "just now"}
            </p>

            {/* The number was on this screen from the start and the way to
                USE it was not. Every other surface had it — the payment
                email, our confirmation email, the kiosk card — so the one
                place the customer is definitely looking, at the moment they
                definitely have the number, was the only one that made them
                go and find an email instead.

                Not shown at the kiosk: KioskPickupCard says all of this
                already, in a form built to be read across a counter. */}
            {!kiosk.enabled && showTracker && (
              <p className="mt-5 text-fine font-medium leading-6 text-[var(--ink-muted)]">
                <a
                  className="underline decoration-1 underline-offset-2 transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)]"
                  href={getTrackUrl(quoteConfirmation?.quoteNumber)}
                >
                  Check on this quote any time
                </a>{" "}
                &mdash; it asks for this number and your email address.
              </p>
            )}
          </div>

          {/* The counter customer gets no email from this system — not the
              payment request (suppressed on the server for kiosk sessions)
              and not the confirmation (same rule, lib/order-confirmation.ts).
              So this is the only moment they can be handed their order number
              and the tracker.

              Website orders are untouched: a sticker order that billed gets
              both in the Printavo payment request, and every other order now
              gets them in our own confirmation email. */}
          {kiosk.enabled && quoteConfirmation?.quoteNumber && (
            <KioskPickupCard
              quoteNumber={quoteConfirmation.quoteNumber}
              email={order.customer.email}
              customerRecord={quoteConfirmation.customerRecord}
              printavoCreated={Boolean(quoteConfirmation.printavoCreated)}
            />
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className=" border border-[var(--rule)] p-5">
              <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--rush-red)]">
                Customer
              </p>

              <p className="mt-2 text-value font-bold text-[var(--ink-black)]">
                {order.customer.customerName}
              </p>

              <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                {order.customer.email}
              </p>

              {order.customer.company && (
                <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                  {order.customer.company}
                </p>
              )}
            </div>

            <div className=" border border-[var(--rule)] p-5">
              <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--rush-red)]">
                {isApparelSubmitted
                  ? "Apparel Details"
                  : isSignsSubmitted
                  ? "Signs Details"
                  : "Sticker Details"}
              </p>

              {isSignsSubmitted ? (
                // Every design, not just the first. A customer who ordered a
                // banner and two yard signs has to see all three back, or the
                // confirmation is confirming something they did not send.
                <div className="space-y-4">
                  {signsQuote.designs.map((design, index) => (
                    <div key={design.id}>
                      {signsQuote.designs.length > 1 && (
                        <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
                          Design {String(index + 1).padStart(2, "0")}
                        </p>
                      )}
                      <p className="mt-2 text-value font-bold text-[var(--ink-black)]">
                        {design.quantity.toLocaleString()}{" "}
                        {getSignProduct(design.productId).label}
                      </p>
                      <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                        {getSignSizeLabel(design)} • {design.material}
                      </p>
                      <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                        {design.finishing} •{" "}
                        {design.doubleSided ? "Double-sided" : "Single-sided"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : isApparelSubmitted && isApparelRequest ? (
                <>
                  {/* The request flow asked for a garment, a count and a
                      description — so the confirmation repeats those, not the
                      colour/ink/location DEFAULTS the flow never asked about.
                      A customer whose notes said "black hats, embroidery"
                      was being confirmed as "White • 1 color • Front". */}
                  <p className="mt-2 text-value font-bold text-[var(--ink-black)]">
                    {apparelQuote.quantity.toLocaleString()}{" "}
                    {apparelQuote.garmentType}
                  </p>
                  <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                    {apparelQuote.specialOrderNotes.trim() ||
                      "Details to be confirmed with Gorilla Salem"}
                  </p>
                </>
              ) : isApparelSubmitted ? (
                <>
                  <p className="mt-2 text-value font-bold text-[var(--ink-black)]">
                    {apparelQuote.quantity.toLocaleString()}{" "}
                    {selectedGarmentLabel}
                  </p>
                  <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                    {selectedSsColor?.colorName || apparelQuote.garmentColor} •{" "}
                    {apparelQuote.inkColors}
                  </p>
                  <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                    {apparelQuote.printLocations.join(", ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-value font-bold text-[var(--ink-black)]">
                    {order.items[0].quantity.toLocaleString()} stickers
                  </p>
                  <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                    {order.items[0].size} • {order.items[0].shape}
                  </p>
                  <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                    {order.items[0].material}
                  </p>
                </>
              )}
            </div>

            <div className=" border border-[var(--rule)] p-5">
              <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--rush-red)]">
                Estimate
              </p>

              {isSignsSubmitted ? (
                signsTotals !== null ? (
                  <>
                    <p className="mt-2 text-head font-bold text-[var(--ink-black)]">
                      ${signsTotals.estimatedTotal.toFixed(2)}
                    </p>
                    {signsTotals.estimatedTax > 0 && (
                      <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                        Includes estimated {SALES_TAX.label}
                      </p>
                    )}
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      Estimate — confirmed before production
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-head font-bold text-[var(--ink-black)]">
                      Quoted by hand
                    </p>
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      Gorilla Salem will reply with your price
                    </p>
                  </>
                )
              ) : isApparelSubmitted ? (
                apparelQuote.specialOrder ? (
                  /**
                   * The payload for a special order says { total: 0,
                   * quoteRequired: true }. This screen was showing the
                   * engine's figure anyway — printing and screens over a
                   * garment the catalogue could not price, $169.00 with the
                   * garments at $0.00 on the day it was caught — so the
                   * customer kept a "confirmation" at a number the shop never
                   * saw and will never bill. Signs already say "Quoted by
                   * hand" here.
                   */
                  <>
                    <p className="mt-2 text-head font-bold text-[var(--ink-black)]">
                      Quoted by hand
                    </p>
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      Gorilla Salem will reply with your price
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-head font-bold text-[var(--ink-black)]">
                      ${apparelPricing.total.toFixed(2)}
                    </p>
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      ${apparelPricing.unitPrice.toFixed(2)} each estimated
                    </p>
                    {/* The assumption travels with the number past submit —
                        this screen shows the figure, so it states the basis,
                        exactly as the review screen did. */}
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      {apparelEstimateBasis === "exact"
                        ? "Priced from your sizes"
                        : `${describeAssumedMix()} We'll confirm sizes with you.`}
                    </p>
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      Final pricing reviewed by Gorilla Salem
                    </p>
                  </>
                )
              ) : (
                <>
                  {/* THE figure that mattered most, and the one the tax line
                      on the review screen originally missed. This is the
                      screen a sticker customer lands on AFTER submitting —
                      the moment a payable link is issued — so showing the
                      pre-tax total here meant they agreed to one number and
                      were billed another, which is the whole defect. */}
                  <p className="mt-2 text-head font-bold text-[var(--ink-black)]">
                    ${stickerTotals.estimatedTotal.toFixed(2)}
                  </p>
                  <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                    ${unitPrice.toFixed(2)} each
                  </p>
                  {stickerTotals.estimatedTax > 0 && (
                    <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                      Includes estimated {SALES_TAX.label}
                    </p>
                  )}
                </>
              )}

              <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
                Needed: {order.production.needBy || "Not entered"}
              </p>
            </div>
          </div>

          <div className="mt-6 bg-[var(--surface-warn)] p-5">
            <p className="text-fine font-medium leading-6 text-[var(--ink-muted)]">
              This is an estimate, not a final invoice. Gorilla Salem will
              confirm pricing, timeline, and artwork readiness before
              production starts.
            </p>

            <p className="mt-3 text-fine font-bold leading-6 text-[var(--ink-muted)]">
              Use Copy Quote Details as a backup, or click Open Gmail Draft to
              open a pre-filled Gmail compose window addressed to Gorilla Salem.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onCopy}
              className=" border border-[var(--gorilla-green)] bg-white px-6 py-4 font-bold text-[var(--gorilla-green)] transition hover:bg-[var(--shirt-blank)]"
            >
              Copy Quote Details
            </button>

            <a
              href={emailHref}
              target="_blank"
              rel="noopener noreferrer"
              className=" bg-[var(--rush-red)] px-6 py-4 text-center font-bold text-white transition hover:bg-[var(--rush-red-dark)]"
            >
              Open Gmail Draft
            </a>

            <button
              type="button"
              onClick={onStartNew}
              className=" bg-[var(--gorilla-green)] px-6 py-4 font-bold text-white transition hover:bg-[var(--gorilla-green-dark)]"
            >
              Start New Quote
            </button>
          </div>

          {copyStatus === "copied" && (
            <p className="mt-3 text-center text-fine font-bold text-[var(--gorilla-green)]">
              Quote details copied to your clipboard.
            </p>
          )}
          {copyStatus === "error" && (
            <p className="mt-3 text-center text-fine font-bold text-[var(--rush-red)]">
              Couldn&apos;t copy automatically — use Open Gmail Draft instead.
            </p>
          )}

          <button
            type="button"
            onClick={onBackToBuilder}
            className="mt-4 w-full bg-[var(--shirt-blank)] px-8 py-4 font-bold text-[var(--ink-muted)] transition hover:bg-[var(--shirt-blank)]"
          >
            Back to Builder
          </button>
        </div>
      </div>
    </main>
  );
}
