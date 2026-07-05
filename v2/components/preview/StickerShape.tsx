import type { CSSProperties, ReactNode } from "react";

type Props = {
  shape: string;
  material?: string;
  finish?: string;
  children: ReactNode;
};

function getShapeClasses(shape: string) {
  if (shape === "Circle") {
    return "rounded-full";
  }

  if (shape === "Square") {
    return "rounded-xl";
  }

  if (shape === "Rounded Square") {
    return "rounded-[2rem]";
  }

  return "rounded-[2rem]";
}

function getMaterialClasses(material: string) {
  if (material === "Holographic") {
    return "bg-gradient-to-br from-pink-200 via-yellow-100 to-blue-200";
  }

  if (material === "Chrome") {
    return "bg-gradient-to-br from-zinc-100 via-white to-zinc-400";
  }

  if (material === "Clear Vinyl") {
    return "bg-white/35";
  }

  return "bg-white";
}

function getDieCutStyle(shape: string): CSSProperties | undefined {
  if (shape !== "Die Cut") {
    return undefined;
  }

  return {
    clipPath:
      "polygon(15% 8%, 69% 6%, 91% 20%, 96% 55%, 82% 88%, 45% 96%, 13% 82%, 5% 43%)",
  };
}

export default function StickerShape({
  shape,
  material = "White Vinyl",
  finish = "Gloss",
  children,
}: Props) {
  const isGloss = finish === "Gloss";
  const isClear = material === "Clear Vinyl";
  const isDieCut = shape === "Die Cut";

  const shapeClasses = getShapeClasses(shape);
  const materialClasses = getMaterialClasses(material);
  const dieCutStyle = getDieCutStyle(shape);

  return (
    <div className="relative mx-auto grid h-72 w-72 place-items-center">
      <div
        className={`absolute inset-3 ${shapeClasses} bg-black/20 blur-xl`}
        style={dieCutStyle}
      />

      <div
        className={`relative grid h-64 w-64 place-items-center overflow-hidden ${shapeClasses} ${materialClasses} p-6 shadow-2xl ring-8 ring-white`}
        style={dieCutStyle}
      >
        {isClear && (
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.35)",
              backgroundImage:
                "linear-gradient(45deg, rgba(0,0,0,.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.08) 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          />
        )}

        {isDieCut && (
          <div
            className="pointer-events-none absolute inset-3 border-2 border-dashed border-white/90"
            style={dieCutStyle}
          />
        )}

        <div className="relative z-10 grid h-full w-full place-items-center">
          {children}
        </div>

        {isGloss && (
          <div
            className={`pointer-events-none absolute -left-16 -top-24 h-64 w-40 rotate-45 bg-white/55 blur-sm ${shapeClasses}`}
          />
        )}

        <div className="pointer-events-none absolute inset-0 ring-1 ring-black/10" />
      </div>
    </div>
  );
}
