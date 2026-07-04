interface Props {
  file: File;
  onRemove: () => void;
}

export default function UploadedFileCard({
  file,
  onRemove,
}: Props) {
  return (
    <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#dfd0b8] bg-white p-5 shadow">
      <div>
        <p className="font-black text-[#171717]">
          📄 {file.name}
        </p>

        <p className="mt-1 text-sm text-[#6f695e]">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>

      <button
        onClick={onRemove}
        className="rounded-xl bg-red-100 px-4 py-2 font-bold text-red-700 transition hover:bg-red-200"
      >
        Remove
      </button>
    </div>
  );
}