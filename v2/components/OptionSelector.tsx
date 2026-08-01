import Chip from "./ui/Chip";

type Props = {
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
};

export default function OptionSelector({
  title,
  options,
  selected,
  onSelect,
}: Props) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-bold">{title}</h3>

      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={selected === option}
            onSelect={() => onSelect(option)}
          />
        ))}
      </div>
    </div>
  );
}
