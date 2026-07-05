import { ArtworkAnalysis } from "../../lib/artwork";

type Props = {
  analysis: ArtworkAnalysis | null;
};

export default function ArtworkAnalysisCard({ analysis }: Props) {
  if (!analysis) {
    return (
      <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
          Artwork Check
        </p>

        <p className="mt-4 text-sm font-bold leading-6 text-[#6f695e]">
          Upload artwork to check file details, image size, and estimated color
          count.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
        Artwork Check
      </p>

      <div className="mt-5 space-y-3 text-sm font-bold text-[#6f695e]">
        <div className="flex justify-between gap-4">
          <span>File</span>
          <span className="text-right text-[#171717]">{analysis.fileName}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Type</span>
          <span className="text-right text-[#171717]">{analysis.fileType}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Size</span>
          <span className="text-right text-[#171717]">{analysis.fileSize}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Dimensions</span>
          <span className="text-right text-[#171717]">
            {analysis.dimensions}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Estimated Colors</span>
          <span className="text-right text-[#171717]">
            {analysis.estimatedColorCount
              ? `${analysis.estimatedColorCount} colors`
              : "N/A"}
          </span>
        </div>
      </div>

      {analysis.palette.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
            Detected Palette
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {analysis.palette.map((color) => (
              <div
                key={color}
                className="h-8 w-8 rounded-full border border-black/10 shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {analysis.notes.length > 0 && (
        <div className="mt-5 rounded-2xl bg-[#F8F5EE] p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
            Notes
          </p>

          <ul className="mt-2 space-y-1 text-xs font-bold leading-5 text-[#6f695e]">
            {analysis.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
