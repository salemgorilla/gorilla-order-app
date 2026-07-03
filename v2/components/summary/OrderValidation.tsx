import { Order } from "../../types/order";
import { getOrderValidationErrors } from "../../lib/validation";

interface Props {
  order: Order;
}

export default function OrderValidation({ order }: Props) {
  const errors = getOrderValidationErrors(order);

  if (errors.length === 0) {
    return (
      <div className="rounded-2xl border border-green-300 bg-green-50 p-5">
        <p className="font-black text-green-700">
          ✅ Ready to Submit
        </p>

        <p className="mt-2 text-sm text-green-600">
          Everything required has been completed.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-5">
      <p className="font-black text-yellow-800">
        Missing Information
      </p>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-yellow-700">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}