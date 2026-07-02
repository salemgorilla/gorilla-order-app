type Props = {
  onFileSelected: (file: File) => void;
};

export default function UploadBox({ onFileSelected }: Props) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-center">
      <p className="text-xl font-bold">Upload Artwork</p>

      <p className="mt-2 text-gray-500">
        PNG, JPG, PDF, SVG, AI
      </p>

      <label className="mt-6 inline-block cursor-pointer rounded-xl bg-[#2E5037] px-6 py-3 font-bold text-white hover:bg-[#24402c]">
        Choose Artwork
        <input
          type="file"
          className="hidden"
          accept=".png,.jpg,.jpeg,.pdf,.svg,.ai"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (!file) return;

            onFileSelected(file);
          }}
        />
      </label>
    </div>
  );
}