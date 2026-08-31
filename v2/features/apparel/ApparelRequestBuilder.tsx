"use client";

import Chip from "../../components/ui/Chip";
import NumberField from "../../components/ui/NumberField";
import { apparelCatalog } from "../../lib/apparel";
import type { FieldErrors } from "../../lib/validation";

type Props = {
  garmentType: string;
  quantity: number;
  notes: string;
  fieldErrors?: FieldErrors;
  onUpdate: (updates: {
    garmentType?: string;
    quantity?: number;
    specialOrderNotes?: string;
  }) => void;
};

/**
 * Order Desk — apparel, as a quote request.
 *
 * Apparel is the shop's highest-value segment and it was a disabled card:
 * anyone who came here for shirts hit a dead end and left, and the shop got
 * nothing — not even an email address to follow up.
 *
 * This is deliberately NOT the apparel configurator. That one exists
 * (ApparelBuilder) and stays unrendered: it prices against the S&S catalog
 * and the screen-print tables, and none of that is signed off. Quoting a
 * customer a number the shop has not stood behind is a worse failure than
 * the dead card was.
 *
 * So: enough to price it by hand, and nothing that implies a price. Three
 * questions, all of which a walk-in customer can answer without a spec.
 */
export default function ApparelRequestBuilder({
  garmentType,
  quantity,
  notes,
  fieldErrors,
  onUpdate,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <h3 className="text-lede font-bold">What are we printing on?</h3>

        <p className="mt-2 text-fine text-[var(--ink-muted)]">
          Pick the closest. You can describe anything else further down.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {apparelCatalog.garmentTypes.map((type) => (
            <Chip
              key={type}
              label={type}
              selected={garmentType === type}
              onSelect={() => onUpdate({ garmentType: type })}
            />
          ))}
        </div>
      </div>

      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <h3 className="text-lede font-bold">Roughly how many?</h3>

        <p className="mt-2 text-fine text-[var(--ink-muted)]">
          An estimate is fine — screen printing gets cheaper per piece the more
          you order, so the count changes the price more than anything else.
        </p>

        <NumberField
          id="apparel-request-quantity"
          label="How many"
          value={quantity}
          min={1}
          step={1}
          className="mt-5 max-w-[220px]"
          snap={(value) => Math.max(1, Math.round(value))}
          onChange={(value) => onUpdate({ quantity: value })}
          error={fieldErrors?.quantity}
        />
      </div>

      {/* The one genuinely open box. Everything the configurator would have
          asked — colours, placements, ink counts, sizes — is cheaper to read
          in a sentence than to model in controls nobody has priced yet. */}
      <div
        className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6"
        data-invalid={fieldErrors?.specialOrderNotes ? "true" : undefined}
      >
        <label htmlFor="apparel-request-notes" className="block">
          <span className="text-lede font-semibold text-[var(--ink-black)]">
            Tell us what you need{" "}
            <span className="text-fine font-normal text-[var(--rush-red)]">
              (required)
            </span>
          </span>
        </label>

        <p className="mt-2 text-fine text-[var(--ink-muted)]">
          Colours, where the print goes, sizes, deadline — whatever you know.
          If you are not sure, say that instead and we will work it out.
        </p>

        <textarea
          id="apparel-request-notes"
          value={notes}
          onChange={(event) =>
            onUpdate({ specialOrderNotes: event.target.value })
          }
          rows={4}
          placeholder="e.g. 40 navy crewnecks, left chest logo plus full back, mixed sizes S-2XL, needed for a team banquet"
          aria-invalid={fieldErrors?.specialOrderNotes ? true : undefined}
          aria-describedby={
            fieldErrors?.specialOrderNotes
              ? "apparel-request-notes-error"
              : undefined
          }
          className={`mt-4 w-full bg-[var(--paper)] px-4 py-3 font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear ${
            fieldErrors?.specialOrderNotes
              ? "border-2 border-[var(--rush-red)]"
              : "border border-[var(--rule)] hover:border-[var(--ink-black)]"
          }`}
        />

        {fieldErrors?.specialOrderNotes && (
          <p
            id="apparel-request-notes-error"
            className="mt-1 text-fine font-bold text-[var(--rush-red)]"
          >
            {fieldErrors.specialOrderNotes}
          </p>
        )}
      </div>

      {/* Said plainly and up front, because the estimate stub says "Priced by
          hand" and a customer who expected a number needs to know that is the
          intent, not a failure. */}
      <p className="border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-4 text-fine font-bold text-[var(--ink-warn)]">
        Apparel is quoted by hand — there is no instant price on this one.
        Send it over and Gorilla Salem will come back with a real number,
        usually the same working day.
      </p>
    </div>
  );
}
