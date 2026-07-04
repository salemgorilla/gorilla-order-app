"use client";

import { useState } from "react";

type Props = {
  onFileSelected: (file: File) => void;
};

export default function UploadBox({ onFileSelected }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;

    onFileSelected(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);

        const file = event.dataTransfer.files?.[0];
        handleFile(file);
      }}
      className={`rounded-[2rem] border-2 border-dashed p-8 transition ${
        isDragging
          ? "border-[#2E5037] bg-[#eef6f0] scale-[1.01]"
          : "border-[#d6c5ab] bg-[#faf8f3] hover:border-[#2E5037] hover:bg-[#f6f2ea]"
      }`}
    >
      <label className="block cursor-pointer">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-[#2E5037] text-4xl text-white shadow-lg">
            {isDragging ? "⬇️" : "📁"}
          </div>

          <h3 className="text-2xl font-black tracking-[-0.03em] text-[#171717]">
            {isDragging ? "Drop It Here" : "Upload Your Artwork"}
          </h3>

          <p className="mt-3 max-w-md text-[#6f695e]">
            Drag and drop your artwork here, or click anywhere to browse your
            files.
          </p>

          <div className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-bold shadow">
            AI • EPS • PDF • SVG • PNG • JPG
          </div>

          <div className="mt-8 rounded-xl bg-[#2E5037] px-8 py-4 font-bold text-white transition hover:bg-[#24402c]">
            Browse Files
          </div>

          <p className="mt-4 text-sm text-[#8b8478]">
            Maximum file size: 100 MB
          </p>
        </div>

        <input
          type="file"
          className="hidden"
          accept=".png,.jpg,.jpeg,.pdf,.svg,.ai,.eps"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}