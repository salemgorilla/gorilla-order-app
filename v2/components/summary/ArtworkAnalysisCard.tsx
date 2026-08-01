import { ArtworkAnalysis } from "../../lib/artwork";

type Props = {
  analysis: ArtworkAnalysis | null;
};

export default function ArtworkAnalysisCard({ analysis }: Props) {
  if (!analysis) {
    return (
      <div className="rounded-[2rem] border border-[var(--rule)] bg-white p-6 shadow-xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
          Artwork Check
        </p>

        <p className="mt-4 text-sm font-bold leading-6 text-[var(--ink-muted)]">
          Upload artwork to check file details, image size, and estimated color
          count.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-[var(--rule)] bg-white p-6 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
        Artwork Check
      </p>

      <div className="mt-5 space-y-3 text-sm font-bold text-[var(--ink-muted)]">
        <div className="flex justify-between gap-4">
          <span>File</span>
          <span className="text-right text-[var(--ink-black)]">{analysis.fileName}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Type</span>
          <span className="text-right text-[var(--ink-black)]">{analysis.fileType}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Size</span>
          <span className="text-right text-[var(--ink-black)]">{analysis.fileSize}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Dimensions</span>
          <span className="text-right text-[var(--ink-black)]">
            {analysis.dimensions}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Estimated Colors</span>
          <span className="text-right text-[var(--ink-black)]">
            {analysis.estimatedColorCount
              ? `${analysis.estimatedColorCount} colors`
              : "N/A"}
          </span>
        </div>
      </div>

      {analysis.palette.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--ink-muted)]">
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
        <div className="mt-5 rounded-2xl bg-[var(--shirt-blank)] p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Notes
          </p>

          <ul className="mt-2 space-y-1 text-xs font-bold leading-5 text-[var(--ink-muted)]">
            {analysis.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
