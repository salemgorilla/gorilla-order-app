type Props = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  notes: string;

  onChange: (updates: {
    customerName?: string;
    company?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }) => void;
};

const FIELD =
  "w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-[var(--ink-black)] " +
  "transition-colors duration-[120ms] ease-linear " +
  "placeholder:text-[var(--ink-muted)]/60 hover:border-[var(--ink-black)]";

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
  onChange,
}: Props) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
      <h3 className="text-lede font-bold">Customer Information</h3>

      <p className="spec mt-1 text-xs text-[var(--ink-muted)]">
        REQUIRED FIELDS MARKED
      </p>

      <div className="mt-5 space-y-4">
        <Field
          id="customer-name"
          label="Your name"
          required
          value={customerName}
          autoComplete="name"
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
          onChange={(v) => onChange({ email: v })}
        />

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

        <div>
          <label
            htmlFor="customer-notes"
            className="block text-sm font-bold text-[var(--ink-black)]"
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
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-bold text-[var(--ink-black)]"
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
        className={`mt-1 ${FIELD}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
