import type { SpecimenKind } from "../../lib/landing";

/**
 * ONE DRAWING PER OFFERING — flat, one ink, hairlines.
 *
 * These stand in for photographs, and are not trying to look like them. Each
 * is a SPEC DRAWING in the register the whole app is in (Republic: every panel
 * is a print ticket): the object in outline, its construction marks, nothing
 * decorative. A grommet is where a grommet goes; a die-cut sticker has its
 * cut line; a yard sign has its stake. The only fill anywhere is the ink.
 *
 * Authored constraint, held on all thirteen: every stroke is 1.5 units at a
 * 120 x 80 viewBox and `vectorEffect="non-scaling-stroke"`, so a hairline is a
 * hairline at thumb size and at hero size, and a corner is square (radius 0 is
 * the house rule; a sticker's curve is product geometry, not UI radius).
 *
 * They draw in `currentColor`, so the card's hover state (ink inversion)
 * recolours the whole drawing without a second set of assets.
 */

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };
const F = { fill: "currentColor", stroke: "none" };
const HAIR = { ...S, strokeWidth: 1 };

function Grommets({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const pts = [
    [x + 4, y + 4],
    [x + w - 4, y + 4],
    [x + 4, y + h - 4],
    [x + w - 4, y + h - 4],
    [x + w / 2, y + 4],
    [x + w / 2, y + h - 4],
  ];

  return (
    <>
      {pts.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} {...S} />
      ))}
    </>
  );
}

function Lines({ x, y, w, count, gap = 5 }: { x: number; y: number; w: number; count: number; gap?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <line key={i} x1={x} x2={x + w * (i % 3 === 2 ? 0.6 : 1)} y1={y + i * gap} y2={y + i * gap} {...HAIR} />
      ))}
    </>
  );
}

export default function Specimen({ kind }: { kind: SpecimenKind }) {
  return (
    <svg
      viewBox="0 0 120 80"
      role="img"
      aria-hidden="true"
      className="h-full w-full"
      focusable="false"
    >
      {kind === "sticker" && (
        <>
          {/* A die-cut: the cut line sits outside the art, with its bleed. */}
          <path d="M60 10 C84 10 100 26 100 42 C100 60 84 70 62 70 C36 70 20 60 20 42 C20 24 38 10 60 10 Z" {...S} />
          <path d="M60 18 C78 18 92 30 92 42 C92 55 78 62 62 62 C42 62 28 54 28 42 C28 30 42 18 60 18 Z" {...HAIR} strokeDasharray="3 3" />
          <path d="M44 44 L56 54 L78 32" {...S} />
        </>
      )}
      {kind === "banner" && (
        <>
          <rect x={10} y={20} width={100} height={40} {...S} />
          <rect x={14} y={24} width={92} height={32} {...HAIR} strokeDasharray="3 3" />
          <Grommets x={10} y={20} w={100} h={40} />
          <path d="M34 46 L44 30 L54 46 M38 40 H50" {...S} />
          <line x1={64} x2={96} y1={34} y2={34} {...S} />
          <line x1={64} x2={88} y1={42} y2={42} {...HAIR} />
        </>
      )}
      {kind === "yard-sign" && (
        <>
          <rect x={30} y={8} width={60} height={42} {...S} />
          {/* The corrugation: flutes run the height of the board. */}
          {[40, 50, 60, 70, 80].map((x) => (
            <line key={x} x1={x} x2={x} y1={8} y2={50} {...HAIR} />
          ))}
          <line x1={48} x2={48} y1={50} y2={74} {...S} />
          <line x1={72} x2={72} y1={50} y2={74} {...S} />
          <line x1={40} x2={80} y1={74} y2={74} {...HAIR} />
        </>
      )}
      {kind === "rigid-sign" && (
        <>
          <rect x={16} y={14} width={88} height={52} {...S} />
          {/* Drilled holes at the corners, the way a rigid panel is mounted. */}
          {[[22, 20], [98, 20], [22, 60], [98, 60]].map(([cx, cy]) => (
            <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={1.8} {...S} />
          ))}
          <rect x={22} y={26} width={76} height={28} {...HAIR} />
          <line x1={16} x2={104} y1={70} y2={70} {...HAIR} />
          <line x1={16} x2={16} y1={67} y2={73} {...HAIR} />
          <line x1={104} x2={104} y1={67} y2={73} {...HAIR} />
        </>
      )}
      {kind === "poster" && (
        <>
          <rect x={38} y={6} width={44} height={68} {...S} />
          <rect x={44} y={12} width={32} height={30} {...HAIR} />
          <Lines x={44} y={50} w={32} count={4} />
        </>
      )}
      {kind === "window" && (
        <>
          <rect x={18} y={10} width={84} height={60} {...S} />
          <line x1={60} x2={60} y1={10} y2={70} {...HAIR} />
          <line x1={18} x2={102} y1={40} y2={40} {...HAIR} />
          <path d="M28 28 H50 M28 33 H44" {...S} />
          <circle cx={82} cy={25} r={7} {...S} />
        </>
      )}
      {kind === "tee" && (
        <>
          <path d="M40 10 L22 20 L10 38 L26 44 L30 36 V70 H90 V36 L94 44 L110 38 L98 20 L80 10 C76 16 44 16 40 10 Z" {...S} />
          {/* The print area: a left-chest and a full-front placement. */}
          <rect x={64} y={24} width={12} height={10} {...HAIR} strokeDasharray="2 2" />
          <rect x={42} y={40} width={36} height={22} {...HAIR} strokeDasharray="3 3" />
        </>
      )}
      {kind === "business-card" && (
        <>
          {/* 3.5 x 2, drawn at its own ratio. */}
          <rect x={22} y={20} width={76} height={43.4} {...S} />
          <line x1={30} x2={56} y1={32} y2={32} {...S} />
          <Lines x={30} y={42} w={36} count={3} gap={5} />
          <rect x={78} y={44} width={12} height={12} {...HAIR} />
        </>
      )}
      {kind === "rack-card" && (
        <>
          {/* 4 x 9, drawn at its own ratio. */}
          <rect x={44} y={6} width={32} height={72} {...S} />
          <rect x={48} y={10} width={24} height={24} {...HAIR} />
          <line x1={48} x2={72} y1={42} y2={42} {...S} />
          <Lines x={48} y={50} w={24} count={5} />
        </>
      )}
      {kind === "postcard" && (
        <>
          {/* 4 x 6 on its side. */}
          <rect x={20} y={14} width={80} height={53.4} {...S} />
          <line x1={64} x2={64} y1={14} y2={67} {...HAIR} />
          <Lines x={70} y={36} w={24} count={3} />
          <rect x={82} y={18} width={13} height={10} {...HAIR} />
        </>
      )}
      {kind === "brochure" && (
        <>
          {/* Three panels, the way it folds. */}
          <rect x={14} y={14} width={92} height={52} {...S} />
          <line x1={44.7} x2={44.7} y1={14} y2={66} {...S} strokeDasharray="3 3" />
          <line x1={75.4} x2={75.4} y1={14} y2={66} {...S} strokeDasharray="3 3" />
          <Lines x={20} y={24} w={20} count={4} />
          <Lines x={50} y={24} w={20} count={4} />
          <rect x={81} y={22} width={20} height={20} {...HAIR} />
        </>
      )}
      {kind === "menu" && (
        <>
          <rect x={34} y={6} width={52} height={68} {...S} />
          <line x1={42} x2={78} y1={16} y2={16} {...S} />
          {[28, 38, 48, 58].map((y) => (
            <g key={y}>
              <line x1={42} x2={64} y1={y} y2={y} {...HAIR} />
              <line x1={70} x2={78} y1={y} y2={y} {...HAIR} />
            </g>
          ))}
        </>
      )}
      {kind === "letterhead" && (
        <>
          <rect x={34} y={6} width={52} height={68} {...S} />
          <circle cx={46} cy={18} r={4} {...S} />
          <line x1={56} x2={78} y1={16} y2={16} {...S} />
          <line x1={56} x2={72} y1={21} y2={21} {...HAIR} />
          <Lines x={42} y={34} w={36} count={6} gap={5} />
        </>
      )}
      {/* An ink dot, so a sparse drawing still reads as printed. Never decoration:
          it is the registration mark every printer's proof carries. */}
      <circle cx={6} cy={6} r={1.4} {...F} />
    </svg>
  );
}
