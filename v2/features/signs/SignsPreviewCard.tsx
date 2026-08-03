"use client";

import { getSignProduct, getSignSizeLabel, type SignsQuote } from "../../lib/signs";

type Props = {
  artworkPreview: string | null;
  signsQuote: SignsQuote;
};

export default function SignsPreviewCard({ artworkPreview, signsQuote }: Props) {
  const product = getSignProduct(signsQuote.productId);

  // Yard signs are roughly 3:4 landscape; banners are much wider. Only used to
  // shape the preview frame so the proof reads like the real thing.
  const isBanner = product.id === "vinyl-banner";
  const aspect = isBanner ? "aspect-[3/1]" : "aspect-[4/3]";

  return (
    <div className=" border border-[var(--rule)] bg-white p-5 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">
            Digital Proof
          </p>
          <h3 className="mt-2 text-head font-bold tracking-display">
            Live Preview
          </h3>
        </div>

        <div className=" bg-[var(--gorilla-green)] px-4 py-2 text-sm font-bold text-white">
          {getSignSizeLabel(signsQuote)}
        </div>
      </div>

      <div className="mt-8 bg-[var(--shirt-blank)] p-5">
        <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
          <p className="eyebrow">
            {product.label} Proof
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
            Preview only — final proof reviewed by Gorilla Salem
          </p>

          <div className="mt-4 grid place-items-center border border-white bg-[radial-gradient(circle_at_top,_#ffffff,_#efe4d4)] p-6">
            <div
              className={`relative w-full ${aspect} overflow-hidden bg-white ring-8 ring-white`}
            >
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {artworkPreview ? (
                  <img
                    src={artworkPreview}
                    alt="Sign artwork preview"
                    className="max-h-full max-w-full object-contain drop-shadow"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[var(--gorilla-green)] text-center text-white">
                    <div>
                      <p className="text-display font-bold tracking-display">GS</p>
                      <p className="mt-2 text-spec font-bold uppercase tracking-[0.2em]">
                        Upload Art
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {signsQuote.finishing === "With H-Stakes" && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-[var(--rule)]" />
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ["Material", signsQuote.material],
              ["Finishing", signsQuote.finishing],
              ["Sides", signsQuote.doubleSided ? "Double" : "Single"],
            ].map(([label, value]) => (
              <div key={label} className=" bg-white p-3">
                <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  {label}
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--ink-black)]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
