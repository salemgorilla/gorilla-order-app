import { ArtworkAnalysis } from "../../lib/artwork";

type Props = {
  analysis: ArtworkAnalysis | null;
};

export default function ArtworkAnalysisCard({ analysis }: Props) {
  if (!analysis) {
    return (
      <div className="rounded-2xl border border-[#dfd0b8] bg-white p-5 shadow">
        <p className="font-black">Artwork Analysis</p>
        <p className="mt-2 text-sm text-[#6f695e]">
          Upload artwork to see basic file checks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#dfd0b8] bg-white p-5 shadow">
      <div className="flex items-center justify-between">
        <p className="font-black">Artwork Analysis</p>
        <span className="rounded-full bg-[#e8f3ec] px-3 py-1 text-sm font-black text-[#2E5037]">
          {analysis.rating}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <p><strong>File:</strong> {analysis.fileName}</p>
        <p><strong>Type:</strong> {analysis.fileType}</p>
        <p><strong>Size:</strong> {analysis.fileSizeMB} MB</p>

        {analysis.width && analysis.height && (
          <p>
            <strong>Dimensions:</strong> {analysis.width} × {analysis.height}px
          </p>
        )}
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[#6f695e]">
        {analysis.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}