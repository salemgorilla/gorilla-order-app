import Chip from "./ui/Chip";

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
          <Chip
            key={quantity}
            // Quantities are real values, so they get the mono spec treatment.
            spec
            label={quantity.toLocaleString()}
            selected={selected === quantity}
            onSelect={() => onSelect(quantity)}
          />
        ))}
      </div>
    </div>
  );
}
