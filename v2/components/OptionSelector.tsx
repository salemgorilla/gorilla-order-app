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
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`rounded-xl border p-4 text-left font-semibold transition ${
              selected === option
                ? "border-[#2E5037] bg-[#2E5037] text-white"
                : "bg-white hover:bg-gray-100"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}