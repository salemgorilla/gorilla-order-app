import { Order } from "../../types/order";
import { getOrderValidationErrors } from "../../lib/validation";

interface Props {
  order: Order;
}

/**
 * Order Desk — validation panel.
 *
 * Customer-facing form, so the accessibility override governs: sentence-case
 * labels, 4.5:1 contrast, and colour is never the only signal — each state
 * carries a left rule, a text label, and (for errors) an explicit count.
 */
export default function OrderValidation({ order }: Props) {
  const errors = getOrderValidationErrors(order);

  if (errors.length === 0) {
    return (
      <div className="border border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)] bg-[var(--surface-ok)] p-5">
        <p className="font-black text-[var(--gorilla-green-dark)]">
          Ready to submit
        </p>

        <p className="mt-2 text-sm text-[var(--ink-black)]">
          Everything required has been completed.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-5">
      <p className="font-black text-[var(--ink-warn)]">
        Missing information
      </p>

      <p className="spec mt-1 text-xs text-[var(--ink-warn)]">
        {errors.length} item{errors.length === 1 ? "" : "s"} left
      </p>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--ink-black)]">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
