type Props = {
  onSubmit: () => void;
};

export default function SubmitButton({ onSubmit }: Props) {
  return (
    <button
      type="button"
      onClick={onSubmit}
      className="w-full rounded-2xl bg-[#b7352d] py-5 text-xl font-black text-white transition hover:bg-[#a32d25] hover:scale-[1.01] active:scale-[0.99]"
    >
      Request Quote →
    </button>
  );
}