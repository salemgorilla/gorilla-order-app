import { HEARD_ABOUT_OPTIONS } from "../lib/attribution";

type Props = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  heardAbout: string[];
  newsletterOptIn: boolean;

  onChange: (updates: {
    customerName?: string;
    company?: string;
    email?: string;
    phone?: string;
    notes?: string;
    heardAbout?: string[];
    newsletterOptIn?: boolean;
  }) => void;

  /** Per-field messages, keyed by the field they belong under. */
  errors?: {
    customerName?: string;
    email?: string;
  };

  /**
   * Set when the boxes were filled in from a previous order on this device.
   *
   * Shown, not silent. A form that fills itself in without saying so leaves
   * the customer wondering where the shop got their details, and gives them
   * nowhere to go if the answer is "from the last person who used this
   * laptop". Never set at the kiosk — the decision is made upstream, on the
   * same kiosk signal everything else reads.
   */
  prefilledFromLastOrder?: boolean;
  onClearRemembered?: () => void;
};

// Split so the invalid state can swap the border rather than stack a second
// width on top of it — `border` and `border-2` are the same property, and the
// winner is decided by stylesheet order, not by class order in the string.
const FIELD_BASE =
  "w-full bg-[var(--paper)] p-3 text-[var(--ink-black)] " +
  "transition-colors duration-[120ms] ease-linear " +
  "placeholder:text-[var(--ink-muted)]/60";

const FIELD_RULE = "border border-[var(--rule)] hover:border-[var(--ink-black)]";

const FIELD_INVALID = "border-2 border-[var(--rush-red)]";

const FIELD = `${FIELD_BASE} ${FIELD_RULE}`;

/**
 * Order Desk — customer capture.
 *
 * Customer-facing form, so the accessibility override governs: sentence-case
 * labels, 4.5:1 contrast, required state carried by text and not colour.
 *
 * These fields previously had placeholders and no labels at all. A
 * placeholder is not a label — it disappears the moment someone types, and
 * screen readers do not reliably announce it. This is the step that decides
 * whether a quote can be replied to, so it gets real labels, real input
 * types (so phones raise the right keyboard), and autofill hints.
 */
export default function CustomerForm({
  customerName,
  company,
  email,
  phone,
  notes,
  heardAbout,
  newsletterOptIn,
  onChange,
  errors,
  prefilledFromLastOrder = false,
  onClearRemembered,
}: Props) {
  function toggleHeardAbout(option: string, checked: boolean) {
    onChange({
      heardAbout: checked
        ? [...heardAbout.filter((item) => item !== option), option]
        : heardAbout.filter((item) => item !== option),
    });
  }

  return (
    <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
      <h3 className="text-lede font-bold">Customer Information</h3>

      <p className="spec mt-1 text-spec text-[var(--ink-muted)]">
        REQUIRED FIELDS MARKED
      </p>

      {/* Say it happened, and offer the way out in the same breath. The exit
          matters more than the notice: the case where somebody needs it is
          the case where these are not their details. */}
      {prefilledFromLastOrder && (
        <p className="mt-3 border-l-2 border-[var(--rule)] pl-3 text-fine leading-5 text-[var(--ink-muted)]">
          Filled in from your last order on this device.{" "}
          <button
            type="button"
            onClick={onClearRemembered}
            className="font-bold text-[var(--ink-black)] underline underline-offset-2 transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gorilla-green)]"
          >
            Not you? Clear it.
          </button>
        </p>
      )}

      <div className="mt-5 space-y-4">
        <Field
          id="customer-name"
          label="Your name"
          required
          value={customerName}
          autoComplete="name"
          error={errors?.customerName}
          onChange={(v) => onChange({ customerName: v })}
        />

        <Field
          id="customer-company"
          label="Company"
          hint="Optional"
          value={company}
          autoComplete="organization"
          onChange={(v) => onChange({ company: v })}
        />

        <Field
          id="customer-email"
          label="Email"
          required
          type="email"
          inputMode="email"
          value={email}
          autoComplete="email"
          error={errors?.email}
          onChange={(v) => onChange({ email: v })}
        />

        {/* Said plainly, because it is true and the customer cannot see it
            happen: if they leave without submitting, the shop is told their
            address so it can follow up. Quietly emailing a half-finished
            form to the shop without saying so is the kind of thing a
            customer should not have to discover. */}
        <p className="text-fine text-[var(--ink-muted)] sm:col-span-2">
          We only use this to reach you about this quote — including if you
          leave before sending it and we can help finish it off.
        </p>

        <Field
          id="customer-phone"
          label="Phone"
          hint="Optional"
          type="tel"
          inputMode="tel"
          value={phone}
          autoComplete="tel"
          onChange={(v) => onChange({ phone: v })}
        />

        {/* A real fieldset/legend, because these are real checkboxes sharing
            one question — a screen reader announces the question with each
            box rather than reading six unrelated labels.

            Optional, and said so. The shop's own audit found abandonment is
            this form's failure mode, and a required marketing question sits
            between a customer and a quote for the shop's benefit, not theirs.
            Multi-select because someone can be sent by a friend and still
            check the Google listing before calling. */}
        <fieldset className="sm:col-span-2">
          <legend className="text-fine font-semibold text-[var(--ink-black)]">
            How did you hear about us?{" "}
            <span className="font-normal text-[var(--ink-muted)]">
              (optional — tick any that apply)
            </span>
          </legend>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {HEARD_ABOUT_OPTIONS.map((option) => {
              const checked = heardAbout.includes(option);

              return (
                // The label supplies the hit area — a checkbox on its own is
                // far under 44px, and DESIGN-SYSTEM §5 makes wrapping it the
                // house answer rather than styling the box larger.
                <label
                  key={option}
                  className={[
                    "flex min-h-[44px] cursor-pointer items-center gap-3",
                    "border bg-[var(--paper)] px-4 py-2 text-fine font-bold",
                    "transition-colors duration-[120ms] ease-linear",
                    // Selected carries a heavier border as well as the tick,
                    // so the state survives greyscale.
                    checked
                      ? "border-2 border-[var(--gorilla-green)] text-[var(--ink-black)]"
                      : "border-[var(--rule)] text-[var(--ink-black)] hover:border-[var(--ink-black)]",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      toggleHeardAbout(option, event.target.checked)
                    }
                    className="size-4 shrink-0 accent-[var(--gorilla-green)]"
                  />
                  {option}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Ships ticked. That default is only defensible while the box is
            plainly visible, says what it signs you up for, and comes off in
            one click — so it is full width, in the reading order, and not
            tucked under the submit button where consent boxes go to hide. */}
        <label
          className={[
            "flex min-h-[44px] cursor-pointer items-start gap-3 sm:col-span-2",
            "border bg-[var(--paper)] p-4",
            "transition-colors duration-[120ms] ease-linear",
            newsletterOptIn
              ? "border-2 border-[var(--gorilla-green)]"
              : "border-[var(--rule)] hover:border-[var(--ink-black)]",
          ].join(" ")}
        >
          <input
            type="checkbox"
            checked={newsletterOptIn}
            onChange={(event) =>
              onChange({ newsletterOptIn: event.target.checked })
            }
            className="mt-0.5 size-4 shrink-0 accent-[var(--gorilla-green)]"
          />

          <span>
            <span className="block text-fine font-semibold text-[var(--ink-black)]">
              Email me occasional Gorilla Salem news and offers
            </span>
            {/* Says what it actually is. "Untick to opt out" is stated
                because the box arrives ticked, and someone skim-reading a
                form should not discover that later from an inbox. */}
            <span className="mt-1 block text-fine text-[var(--ink-muted)]">
              Shop news, seasonal offers and new products. Untick to opt out —
              you will still get everything about this quote either way, and
              you can unsubscribe from any email.
            </span>
          </span>
        </label>

        <div>
          <label
            htmlFor="customer-notes"
            className="block text-fine font-semibold text-[var(--ink-black)]"
          >
            Special instructions{" "}
            <span className="font-normal text-[var(--ink-muted)]">
              (optional)
            </span>
          </label>
          <textarea
            id="customer-notes"
            rows={4}
            className={`mt-1 ${FIELD}`}
            placeholder="Anything we should know about this job?"
            value={notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  type = "text",
  inputMode,
  value,
  autoComplete,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  type?: string;
  inputMode?: "email" | "tel" | "text";
  value: string;
  autoComplete?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;

  return (
    // data-invalid is the scroll target on a failed submit, so it wraps the
    // label as well as the box.
    <div data-invalid={error ? "true" : undefined}>
      <label
        htmlFor={id}
        className="block text-fine font-semibold text-[var(--ink-black)]"
      >
        {label}{" "}
        {required ? (
          // Text, not just a red glyph — colour is never the only signal.
          <span className="font-normal text-[var(--rush-red)]">(required)</span>
        ) : hint ? (
          <span className="font-normal text-[var(--ink-muted)]">({hint})</span>
        ) : null}
      </label>

      <input
        id={id}
        type={type}
        inputMode={inputMode}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-1 ${FIELD_BASE} ${error ? FIELD_INVALID : FIELD_RULE}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {error && (
        <p id={errorId} className="mt-1 text-fine font-bold text-[var(--rush-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
