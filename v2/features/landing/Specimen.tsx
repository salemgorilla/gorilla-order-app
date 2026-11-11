import type { SpecimenKind } from "../../lib/landing";

/**
 * ONE MARK PER OFFERING — a solid block of ink with its working parts cut out.
 *
 * Gabe, 2026-11-11: "a grid with all the options for the client as a button
 * represented in some art/design logo like image." The first pass drew these as
 * thin outlines (spec drawings); they read as diagrams, not as buttons. These
 * are emblems: each product is a heavy, flat silhouette — the way a rubber
 * stamp or a stencil is — and everything that makes it THAT product (the
 * grommets on a banner, the stake under a yard sign, the folds of a trifold) is
 * knocked out of the block in negative space.
 *
 * ── THE HELD CONSTRAINT (named, and kept on all thirteen) ─────────────────
 * One ink, no outline anywhere: a mark is a filled shape plus holes. Holes are
 * drawn in `--knock`, which the button sets to the cell colour and flips on
 * hover, so ink inversion recolours the block AND its cut-outs and the knocked
 * details are never left behind as stray white shapes on an inverted tile. The
 * only strokes are the few that ARE cut lines (a die-cut's offset, a fold) and
 * they are 4 units on a 100-unit tile — as heavy as the block they sit in.
 *
 * Every product is drawn at its own proportion where it has one — a business
 * card is 3.5 x 2 (1.75:1), a rack card 4 x 9, a postcard 4 x 6 — so the mark
 * is derived from the real thing and the shapes are not interchangeable.
 *
 * Square corners (the house rule is radius 0; a sticker's curve is product
 * geometry, not UI radius). No gradient, no shadow, no blur, no photograph.
 */

const K = "var(--knock, var(--paper))";
const KNOCK = { fill: K, stroke: "none" } as const;
const CUT = { fill: "none", stroke: K, strokeWidth: 4, vectorEffect: "non-scaling-stroke" } as const;

/** A row of copy, as a bar. Heavier than a hairline: it has to read at thumb size. */
function Bar({ x, y, w, h = 3.4 }: { x: number; y: number; w: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} {...KNOCK} />;
}

function Bars({ x, y, w, rows, gap = 7 }: { x: number; y: number; w: number; rows: number; gap?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <Bar key={i} x={x} y={y + i * gap} w={i % 3 === 2 ? w * 0.6 : w} />
      ))}
    </>
  );
}

export default function Specimen({ kind }: { kind: SpecimenKind }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-hidden="true" className="h-full w-full" focusable="false" fill="currentColor">
      {kind === "sticker" && (
        <>
          {/* The sticker, and its die cut: an offset line around it, knocked
              out of the surrounding block so the cut reads as a cut. */}
          <path d="M50 12 C74 12 90 28 90 50 C90 72 72 88 48 88 C24 88 10 72 10 48 C10 26 26 12 50 12 Z" />
          <path d="M50 20 C70 20 82 32 82 50 C82 67 68 80 48 80 C30 80 18 67 18 48 C18 32 30 20 50 20 Z" {...CUT} strokeDasharray="7 6" />
          <path d="M32 50 L46 64 L70 36" {...CUT} strokeWidth={9} />
        </>
      )}
      {kind === "banner" && (
        <>
          <rect x={6} y={26} width={88} height={48} />
          {[[14, 34], [50, 34], [86, 34], [14, 66], [50, 66], [86, 66]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.2} {...KNOCK} />
          ))}
          {/* The headline, as the letter A and a rule. */}
          <path d="M26 62 L38 38 L50 62 M31 54 H45" {...CUT} strokeWidth={6} />
          <rect x={58} y={42} width={24} height={5} {...KNOCK} />
          <rect x={58} y={53} width={16} height={5} {...KNOCK} />
        </>
      )}
      {kind === "yard-sign" && (
        <>
          <rect x={16} y={8} width={68} height={50} />
          {/* The corrugation: flutes run the full height of the board. */}
          {[30, 43, 56, 69].map((x) => (
            <rect key={x} x={x} y={8} width={2.6} height={50} {...KNOCK} />
          ))}
          <rect x={30} y={58} width={9} height={34} />
          <rect x={61} y={58} width={9} height={34} />
          <rect x={22} y={92} width={56} height={4} />
        </>
      )}
      {kind === "rigid-sign" && (
        <>
          <rect x={8} y={20} width={84} height={60} />
          {[[16, 28], [84, 28], [16, 72], [84, 72]].map(([cx, cy]) => (
            <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={3.6} {...KNOCK} />
          ))}
          <rect x={22} y={34} width={56} height={32} {...CUT} />
          <rect x={32} y={44} width={36} height={5} {...KNOCK} />
          <rect x={32} y={54} width={22} height={5} {...KNOCK} />
        </>
      )}
      {kind === "poster" && (
        <>
          <rect x={22} y={6} width={56} height={88} />
          <rect x={30} y={14} width={40} height={36} {...KNOCK} />
          <path d="M30 50 L44 30 L52 40 L58 34 L70 50 Z" />
          <Bars x={30} y={60} w={40} rows={4} gap={8} />
        </>
      )}
      {kind === "window" && (
        <>
          <rect x={14} y={8} width={72} height={84} />
          <rect x={20} y={14} width={60} height={72} {...CUT} />
          <rect x={48} y={14} width={4.4} height={72} {...KNOCK} />
          <rect x={20} y={48} width={60} height={4.4} {...KNOCK} />
          {/* The vinyl: a circle and a line of type, applied to the glass. */}
          <circle cx={34} cy={31} r={7} {...KNOCK} />
          <rect x={58} y={26} width={16} height={5} {...KNOCK} />
          <rect x={58} y={35} width={11} height={5} {...KNOCK} />
        </>
      )}
      {kind === "tee" && (
        <>
          <path d="M36 8 L8 24 L18 46 L30 40 V92 H70 V40 L82 46 L92 24 L64 8 C60 18 40 18 36 8 Z" />
          {/* Two placements, as printed: left chest, and full front. */}
          <rect x={56} y={30} width={12} height={12} {...KNOCK} />
          <rect x={36} y={50} width={28} height={30} {...CUT} strokeDasharray="6 5" />
        </>
      )}
      {kind === "business-card" && (
        <>
          {/* 3.5 x 2 — 1.75:1. */}
          <rect x={8} y={30} width={84} height={48} />
          <rect x={16} y={39} width={30} height={6} {...KNOCK} />
          <Bars x={16} y={52} w={34} rows={3} gap={7} />
          <rect x={66} y={52} width={18} height={18} {...KNOCK} />
        </>
      )}
      {kind === "rack-card" && (
        <>
          {/* 4 x 9 — 0.44:1. */}
          <rect x={30} y={4} width={40} height={92} />
          <rect x={36} y={10} width={28} height={30} {...KNOCK} />
          <rect x={36} y={48} width={28} height={6} {...KNOCK} />
          <Bars x={36} y={60} w={28} rows={5} gap={7} />
        </>
      )}
      {kind === "postcard" && (
        <>
          {/* 4 x 6 on its side — 1.5:1. */}
          <rect x={8} y={22} width={84} height={56} />
          <rect x={53} y={28} width={3.2} height={44} {...KNOCK} />
          <Bars x={61} y={46} w={24} rows={3} gap={7} />
          <rect x={72} y={28} width={14} height={12} {...KNOCK} />
          <rect x={16} y={34} width={28} height={30} {...CUT} />
        </>
      )}
      {kind === "brochure" && (
        <>
          {/* Three panels, and the two folds between them. */}
          <rect x={6} y={18} width={88} height={64} />
          <rect x={35} y={18} width={3.6} height={64} {...KNOCK} />
          <rect x={63} y={18} width={3.6} height={64} {...KNOCK} />
          <Bars x={12} y={28} w={18} rows={5} gap={9} />
          <Bars x={43} y={28} w={18} rows={5} gap={9} />
          <rect x={72} y={28} width={16} height={16} {...KNOCK} />
          <rect x={72} y={52} width={16} height={5} {...KNOCK} />
        </>
      )}
      {kind === "menu" && (
        <>
          <rect x={22} y={6} width={56} height={88} />
          <rect x={30} y={14} width={40} height={6} {...KNOCK} />
          {[30, 42, 54, 66, 78].map((y) => (
            <g key={y}>
              <rect x={30} y={y} width={26} height={4} {...KNOCK} />
              <rect x={62} y={y} width={8} height={4} {...KNOCK} />
            </g>
          ))}
        </>
      )}
      {kind === "letterhead" && (
        <>
          <rect x={22} y={6} width={56} height={88} />
          <circle cx={36} cy={22} r={7} {...KNOCK} />
          <rect x={48} y={17} width={22} height={5} {...KNOCK} />
          <rect x={48} y={25} width={15} height={3.4} {...KNOCK} />
          <Bars x={30} y={44} w={40} rows={6} gap={8} />
        </>
      )}
    </svg>
  );
}
