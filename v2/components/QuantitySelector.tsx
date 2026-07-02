type Props = {
  quantities: number[];
  selected: number;
  onSelect: (quantity: number) => void;
};

export default function QuantitySelector({
  quantities,
  selected,
  onSelect,
}: Props) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-bold">Quantity</h3>

      <div className="grid grid-cols-2 gap-3">
        {quantities.map((quantity) => (
          <button
            key={quantity}
            onClick={() => onSelect(quantity)}
            className={`rounded-xl border p-4 text-lg font-semibold transition ${
              selected === quantity
                ? "bg-[#2E5037] text-white border-[#2E5037]"
                : "bg-white hover:bg-gray-100"
            }`}
          >
            {quantity.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}