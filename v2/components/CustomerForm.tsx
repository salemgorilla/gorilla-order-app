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

export default function CustomerForm({
  customerName,
  company,
  email,
  phone,
  notes,
  onChange,
}: Props) {
  return (
    <div className="rounded-3xl border border-[#dfd0b8] bg-[#F8F5EE] p-6">
      <h3 className="text-xl font-black">Customer Information</h3>

      <div className="mt-5 space-y-4">

        <input
          className="w-full rounded-xl border p-3"
          placeholder="Full Name"
          value={customerName}
          onChange={(e) =>
            onChange({ customerName: e.target.value })
          }
        />

        <input
          className="w-full rounded-xl border p-3"
          placeholder="Company (optional)"
          value={company}
          onChange={(e) =>
            onChange({ company: e.target.value })
          }
        />

        <input
          className="w-full rounded-xl border p-3"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            onChange({ email: e.target.value })
          }
        />

        <input
          className="w-full rounded-xl border p-3"
          placeholder="Phone"
          value={phone}
          onChange={(e) =>
            onChange({ phone: e.target.value })
          }
        />

        <textarea
          rows={4}
          className="w-full rounded-xl border p-3"
          placeholder="Special Instructions..."
          value={notes}
          onChange={(e) =>
            onChange({ notes: e.target.value })
          }
        />

      </div>
    </div>
  );
}