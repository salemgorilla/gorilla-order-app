type Props = {
  shape: string;
  children: React.ReactNode;
};

export default function StickerShape({ shape, children }: Props) {
  let shapeClasses =
    "relative grid h-64 w-64 place-items-center bg-white p-6 shadow-2xl ring-8 ring-white overflow-hidden";

  if (shape === "Circle") {
    shapeClasses += " rounded-full";
  } else if (shape === "Rounded Square") {
    shapeClasses += " rounded-[2rem]";
  } else if (shape === "Die Cut") {
    shapeClasses += " rounded-[2rem]";
  } else {
    shapeClasses += " rounded-md";
  }

  return (
    <div className={shapeClasses}>
      {children}

      {shape === "Die Cut" && (
        <div className="pointer-events-none absolute inset-2 rounded-[1.5rem] border-4 border-white" />
      )}
    </div>
  );
}