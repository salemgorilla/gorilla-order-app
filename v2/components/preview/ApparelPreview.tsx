type Props = {
  artworkPreview: string | null;
  garmentType: string;
  garmentColor: string;
  garmentImage?: string | null;
  printLocations: string[];
  inkColors: string;
  quantity: number;
};

const garmentColors: Record<string, string> = {
  Black: "#171717",
  White: "#f8f5ee",
  "Heather Gray": "#9ca3af",
  Navy: "#1e3a5f",
  "Forest Green": "#2E5037",
  Red: "#b7352d",
  "Custom / Not Sure": "#6f695e",
};

function getGarmentColor(color: string) {
  return garmentColors[color] || "#2E5037";
}

function getContrastText(color: string) {
  if (color === "White" || color === "Heather Gray") {
    return "#171717";
  }

  return "#ffffff";
}

function hasLocation(printLocations: string[], location: string) {
  return printLocations.includes(location);
}

export default function ApparelPreview({
  artworkPreview,
  garmentType,
  garmentColor,
  garmentImage,
  printLocations,
  inkColors,
  quantity,
}: Props) {
  const baseColor = getGarmentColor(garmentColor);
  const textColor = getContrastText(garmentColor);
  const isHoodie = garmentType === "Hoodies";
  const isCrewneck = garmentType === "Crewnecks";
  const isHat = garmentType === "Hats";

  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-5 shadow-xl sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#b7352d]">
            Apparel Proof
          </p>

          <h3 className="mt-2 text-3xl font-bold tracking-[-0.05em]">
            Live Preview
          </h3>
        </div>

        <div className="rounded-full bg-[#2E5037] px-4 py-2 text-sm font-bold text-white">
          {garmentType}
        </div>
      </div>

      <div className="mt-8 rounded-[2rem] bg-gradient-to-br from-white to-[#f1e5cf] p-5">
        <div className="rounded-[1.5rem] border border-[#dfd0b8] bg-[#F8F5EE] p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b7352d]">
                Garment Mockup
              </p>
              <p className="mt-1 text-sm font-bold text-[#6f695e]">
                Preview only — final proof reviewed by Gorilla Salem
              </p>
            </div>

            <div className="rounded-full bg-white px-3 py-2 text-xs font-bold text-[#2E5037] shadow-sm">
              {quantity} pcs
            </div>
          </div>

          <div className="grid min-h-96 place-items-center rounded-[1.25rem] border border-white bg-[radial-gradient(circle_at_top,_#ffffff,_#efe4d4)] p-6">
            {isHat ? (
              <div className="relative h-56 w-72">
                <div
                  className="absolute left-8 top-16 h-28 w-56 rounded-t-[5rem] rounded-b-[2rem] shadow-2xl ring-4 ring-white"
                  style={{ backgroundColor: baseColor }}
                />

                <div
                  className="absolute left-28 top-40 h-10 w-36 rounded-full shadow-xl ring-4 ring-white"
                  style={{ backgroundColor: baseColor }}
                />

                <div
                  className="absolute left-24 top-24 grid h-20 w-32 place-items-center rounded-2xl bg-white/90 p-3 text-center shadow-lg"
                  style={{ color: "#171717" }}
                >
                  {artworkPreview ? (
                    <img
                      src={artworkPreview}
                      alt="Uploaded artwork preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-2xl font-bold tracking-[-0.08em]">GS</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative h-96 w-80">
                {isHoodie && (
                  <div
                    className="absolute left-24 top-0 h-28 w-32 rounded-t-[4rem] rounded-b-[2rem] shadow-xl ring-4 ring-white"
                    style={{ backgroundColor: baseColor }}
                  />
                )}

                <div
                  className={`absolute left-16 top-16 h-72 w-48 shadow-2xl ring-4 ring-white ${
                    isHoodie
                      ? "rounded-t-[2rem] rounded-b-[3rem]"
                      : isCrewneck
                      ? "rounded-t-[3rem] rounded-b-[2rem]"
                      : "rounded-t-[1.5rem] rounded-b-[2.5rem]"
                  }`}
                  style={{ backgroundColor: baseColor }}
                />

                <div
                  className="absolute left-2 top-24 h-32 w-20 -rotate-12 rounded-[2rem] shadow-xl ring-4 ring-white"
                  style={{ backgroundColor: baseColor }}
                />

                <div
                  className="absolute right-2 top-24 h-32 w-20 rotate-12 rounded-[2rem] shadow-xl ring-4 ring-white"
                  style={{ backgroundColor: baseColor }}
                />

                <div className="absolute left-28 top-16 h-12 w-24 rounded-b-full bg-[#F8F5EE]/80" />

                {isHoodie && (
                  <div className="absolute left-28 top-56 h-20 w-24 rounded-t-[1.5rem] rounded-b-[2rem] border-2 border-white/50 bg-black/10" />
                )}

                {garmentImage && (
                  <img
                    src={garmentImage}
                    alt={`${garmentColor} ${garmentType}`}
                    className="absolute inset-0 h-full w-full object-contain opacity-95"
                  />
                )}

                {hasLocation(printLocations, "Front") && (
                  <div className="absolute left-24 top-36 grid h-28 w-32 place-items-center rounded-2xl bg-white/90 p-3 text-center shadow-lg">
                    {artworkPreview ? (
                      <img
                        src={artworkPreview}
                        alt="Uploaded artwork preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <p className="text-3xl font-bold tracking-[-0.08em] text-[#2E5037]">
                        GS
                      </p>
                    )}
                  </div>
                )}

                {hasLocation(printLocations, "Left Chest") && (
                  <div className="absolute left-25 top-28 grid h-12 w-12 place-items-center rounded-xl bg-white/90 p-1 shadow-lg">
                    {artworkPreview ? (
                      <img
                        src={artworkPreview}
                        alt="Left chest artwork preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <p className="text-sm font-bold text-[#2E5037]">GS</p>
                    )}
                  </div>
                )}

                {hasLocation(printLocations, "Sleeve") && (
                  <>
                    <div className="absolute left-7 top-36 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#2E5037] shadow">
                      Sleeve
                    </div>
                    <div className="absolute right-6 top-36 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#2E5037] shadow">
                      Sleeve
                    </div>
                  </>
                )}

                {hasLocation(printLocations, "Back") && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#2E5037] shadow">
                    Back print requested
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f695e]">
                Garment
              </p>
              <p className="mt-1 text-sm font-bold text-[#171717]">
                {garmentType}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f695e]">
                Color
              </p>
              <p className="mt-1 text-sm font-bold text-[#171717]">
                {garmentColor}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f695e]">
                Ink
              </p>
              <p className="mt-1 text-sm font-bold text-[#171717]">
                {inkColors}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-white p-3 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f695e]">
              Print Locations
            </p>
            <p className="mt-1 text-sm font-bold text-[#171717]">
              {printLocations.length > 0
                ? printLocations.join(" • ")
                : "None selected"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
