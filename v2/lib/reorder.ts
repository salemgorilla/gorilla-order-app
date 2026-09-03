/**
 * Reorder links — "order these again" as a URL.
 *
 * Sticker customers are repeat customers, and today a repeat order means
 * rebuilding the whole quote from memory: the size, the shape, the vinyl,
 * the count. The confirmation email already reaches them with the quote
 * number; this puts their SPEC in that email as a link that sets the
 * builder back up the way they had it.
 *
 * ── TWO PROPERTIES THAT MAKE THIS SAFE ────────────────────────────────────
 *
 * 1. A LINK CARRIES THE SPEC, NEVER A PRICE. Prices come from the engine,
 *    every time, exactly as they do for a fresh quote. A link that carried
 *    $53.80 would quote last spring's price next spring — the same class of
 *    defect as a figure that was "correct while the catalogue was dark".
 *    There is no price field in this format, and a test says so by name.
 *
 * 2. A LINK NEVER SUBMITS ANYTHING. It prefills a builder the customer then
 *    reviews and sends, like any other quote. Stickers auto-bill, so a URL
 *    that could place an order would be a URL that could take money — this
 *    one lands on step 1 with the cart filled in and nothing else done.
 *
 * The format is readable on purpose (`?reorder=1&d=100@3x3:gloss-white-vinyl:die-cut`)
 * rather than an opaque blob: a customer can see what they are about to
 * reorder before they click, and a shop can read one out of an email while
 * on the phone. Parsing is TOLERANT — anything malformed is skipped, and a
 * link that decodes to nothing prefills nothing rather than erroring.
 */

/** One design, as a link carries it. Spec only — see property 1 above. */
export type ReorderDesign = {
  quantity: number;
  widthInches: number;
  heightInches: number;
  material: string;
  shape: string;
};

export type ReorderSpec = {
  designs: ReorderDesign[];
  /** "pickup" | "ship", or "" when the link does not say. */
  deliveryMethod: string;
};

/** Format version, so an old link can never be read by newer rules. */
export const REORDER_VERSION = "1";

const MAX_DESIGNS = 10;

/** "Gloss White Vinyl" -> "gloss-white-vinyl", and back by comparison. */
function slug(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The query string for a cart, or "" when there is nothing worth linking.
 *
 * Takes the ITEMS, not an order: the caller decides what is reorderable,
 * and this stays a pure mapping with no opinion about flows.
 */
export function encodeReorder(input: {
  items: Array<{
    quantity?: unknown;
    widthInches?: unknown;
    heightInches?: unknown;
    material?: unknown;
    shape?: unknown;
  }>;
  deliveryMethod?: unknown;
}): string {
  const parts: string[] = [`reorder=${REORDER_VERSION}`];

  const designs = (Array.isArray(input.items) ? input.items : [])
    .slice(0, MAX_DESIGNS)
    .map((item) => {
      const quantity = Math.floor(Number(item.quantity) || 0);
      const width = round2(Number(item.widthInches) || 0);
      const height = round2(Number(item.heightInches) || 0);

      // A design the engine could not price is a design not worth
      // reoffering: the link would rebuild something that cannot check out.
      if (quantity <= 0 || width <= 0 || height <= 0) return null;

      return `${quantity}@${width}x${height}:${slug(
        String(item.material || "")
      )}:${slug(String(item.shape || ""))}`;
    })
    .filter((part): part is string => Boolean(part));

  if (designs.length === 0) return "";

  for (const design of designs) {
    parts.push(`d=${encodeURIComponent(design)}`);
  }

  const delivery = slug(String(input.deliveryMethod || ""));
  if (delivery) parts.push(`delivery=${delivery}`);

  return `?${parts.join("&")}`;
}

/**
 * Read a link back. Tolerant by contract: unknown version, missing parts,
 * junk numbers and absurd counts all decode to "nothing to prefill"
 * rather than throwing or half-filling a cart.
 *
 * `materials` and `shapes` are the CURRENT catalogue. A link naming a
 * material the shop no longer sells resolves to nothing for that field, so
 * the builder keeps its own default instead of quoting a discontinued
 * vinyl — the link is a convenience, never an authority on what is sold.
 */
export function decodeReorder(
  search: string,
  catalogue: { materials: string[]; shapes: string[] }
): ReorderSpec | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
  } catch {
    return null;
  }

  if (params.get("reorder") !== REORDER_VERSION) return null;

  const match = (value: string, options: string[]): string =>
    options.find((option) => slug(option) === value) || "";

  const designs: ReorderDesign[] = [];

  for (const raw of params.getAll("d").slice(0, MAX_DESIGNS)) {
    const parsed = /^(\d+)@([\d.]+)x([\d.]+):([a-z0-9-]*):([a-z0-9-]*)$/.exec(
      raw.trim()
    );
    if (!parsed) continue;

    const quantity = Number(parsed[1]);
    const widthInches = Number(parsed[2]);
    const heightInches = Number(parsed[3]);

    // Sanity, not policy: the builder's own rules still apply once these
    // land in it. This only refuses values that could never be typed.
    if (
      !(quantity > 0 && quantity <= 100000) ||
      !(widthInches > 0 && widthInches <= 100) ||
      !(heightInches > 0 && heightInches <= 100)
    ) {
      continue;
    }

    designs.push({
      quantity,
      widthInches: round2(widthInches),
      heightInches: round2(heightInches),
      material: match(parsed[4], catalogue.materials),
      shape: match(parsed[5], catalogue.shapes),
    });
  }

  if (designs.length === 0) return null;

  const delivery = params.get("delivery") || "";

  return {
    designs,
    deliveryMethod:
      delivery === "pickup" ? "Pickup" : delivery === "ship" ? "Ship" : "",
  };
}

/** The full link, for an email or a copied record. */
export function reorderUrl(
  origin: string,
  input: Parameters<typeof encodeReorder>[0]
): string | null {
  const query = encodeReorder(input);
  if (!query) return null;

  return `${origin.replace(/\/+$/, "")}/${query}`;
}
