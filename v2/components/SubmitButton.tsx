type Props = {
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
};

export default function SubmitButton({
  onSubmit,
  disabled = false,
  isLoading = false,
}: Props) {
  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={disabled || isLoading}
      className={`w-full rounded-2xl py-5 text-xl font-black transition ${
        disabled || isLoading
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "bg-[#b7352d] text-white hover:scale-[1.01] hover:bg-[#a32d25] active:scale-[0.99]"
      }`}
    >
      {isLoading ? "Requesting Quote..." : "Request Quote →"}
    </button>
  );
}