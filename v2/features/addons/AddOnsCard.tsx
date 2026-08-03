import { AddOn } from "../../types/order";
import {
  AddOnOffer,
  getAddOnOffers,
  summariseAddOns,
  toAddOn,
} from "../../lib/addons";

type Props = {
  flow: string;
  addOns: AddOn[];
  note: string;
  onToggle: (offer: AddOnOffer, checked: boolean) => void;
  onNoteChange: (value: string) => void;
};

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Order Desk — "Add to this quote".
 *
 * Sits after the customer has seen their estimate. Ticking a row adds the
 * item to the quote the shop sends back; it never changes the estimate on
 * screen, and it never blocks submission.
 *
 * The strip is intentionally subordinate to the priced cards around it —
 * SHIRT BLANK ground rather than PAPER, so it reads as a footnote to the
 * quote rather than a second checkout.
 */
export default function AddOnsCard({
  flow,
  addOns,
  note,
  onToggle,
  onNoteChange,
}: Props) {
  const offers = getAddOnOffers(flow);
  if (offers.length === 0) return null;

  const { priced, quoteCount } = summariseAddOns(addOns);
  const selectedIds = new Set(addOns.map((a) => a.id));

  return (
    <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
      <p className="eyebrow">
        Add to this quote
      </p>
      <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
        Same artwork, same due date — one quote, one pickup.
      </p>

      <div className="mt-4 space-y-3">
        {offers.map((offer) => {
          const { amount, quoteRequired } = offer.price();
          const checked = selectedIds.has(offer.id);

          return (
            <label
              key={offer.id}
              className="flex cursor-pointer items-start gap-3 border border-[var(--rule)] bg-[var(--paper)] p-4 transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onToggle(offer, event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--gorilla-green)]"
              />
              <span className="flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="block text-sm font-bold text-[var(--ink-black)]">
                    {offer.label}
                  </span>
                  {/* Never a "from $X" — the app already distinguishes a real
                      price from one the shop has to work out. */}
                  {quoteRequired ? (
                    <span className="shrink-0 text-sm font-bold text-[var(--ink-muted)]">
                      We&apos;ll price this
                    </span>
                  ) : (
                    <span className="spec shrink-0 text-sm font-bold text-[var(--gorilla-green)]">
                      {money(amount)}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-sm font-bold leading-5 text-[var(--ink-muted)]">
                  {offer.detail}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4">
        <label
          htmlFor="addons-note"
          className="block text-sm font-bold text-[var(--ink-black)]"
        >
          Something else?{" "}
          <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
        </label>
        <input
          id="addons-note"
          type="text"
          maxLength={120}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Business cards, flyers, koozies..."
          className="mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear placeholder:text-[var(--ink-muted)]/60 hover:border-[var(--ink-black)]"
        />
      </div>

      {(addOns.length > 0 || note.trim()) && (
        <p className="spec mt-4 border-t border-[var(--rule)] pt-3 text-xs font-bold text-[var(--ink-black)]">
          {/* Two figures, never merged — a single total would look like it
              covered the unpriced items too. */}
          ADDED TO THIS QUOTE:{" "}
          {priced > 0 ? money(priced) : "0 priced items"}
          {quoteCount > 0 &&
            ` + ${quoteCount} item${quoteCount === 1 ? "" : "s"} we'll price`}
          {note.trim() ? " + your note" : ""}
        </p>
      )}

      <p className="mt-3 text-xs font-bold leading-5 text-[var(--ink-muted)]">
        These are added to the quote Gorilla Salem sends back. Your estimate
        above doesn&apos;t change, and nothing here is charged now.
      </p>
    </div>
  );
}
