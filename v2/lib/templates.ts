/**
 * Shop-authored templates the customer personalises with their own words.
 *
 * ── WHY THIS SHAPE ────────────────────────────────────────────────────────
 * The app does NOT produce print-ready artwork, and is not trying to. A
 * browser canvas gives you RGB at screen resolution with no bleed and no
 * vector cut path, which is why an embedded Canva or Adobe Express still
 * leaves the shop doing prepress on every order.
 *
 * So the app captures the only two things it can be trusted with — WHICH
 * template and WHAT TEXT — and renders a faithful preview so the customer
 * knows what they are approving. Gorilla Salem drops the text into the master
 * file it already owns. CMYK, bleed and DPI never enter the picture, because
 * the artwork was print-ready before the customer arrived.
 *
 * That also means the numbers below are LAYOUT for the preview, not print
 * geometry. They are fractions of the canvas so one template renders at any
 * size, and nothing downstream measures anything from them.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type TemplateTextField = {
  id: string;
  /** Sentence case — this is a form label, per the accessibility floor. */
  label: string;
  /**
   * A hard cap, chosen so the line still fits the layout. Long text on a yard
   * sign is the failure mode: it either overflows the board or shrinks to
   * something nobody can read from a pavement.
   */
  maxLength: number;
  placeholder: string;
  defaultValue: string;
  required?: boolean;
  /** Centre of the text block, as a fraction of the canvas. */
  x: number;
  y: number;
  /** Type size as a fraction of canvas HEIGHT, so it scales with the sign. */
  sizePct: number;
  weight: number;
  uppercase?: boolean;
  /**
   * Ink for this line. A print colour chosen by the shop, NOT a UI token —
   * same category as the garment blanks in DESIGN-SYSTEM §3.
   */
  color: string;
};

export type DesignTemplate = {
  id: string;
  name: string;
  /** One-liner shown under the name in the picker. */
  description: string;
  /** Sign product ids this suits. Empty means every product in the flow. */
  products: string[];
  background: string;
  /** Width / height, used only to shape the preview frame. */
  aspect: number;
  fields: TemplateTextField[];
};

/**
 * The starting set: the jobs a Salem sign shop actually gets asked for.
 *
 * Deliberately typography on a flat ground. Every one of these is print-ready
 * as vector type, needs no image assets, and is the shape of the majority of
 * real yard-sign and banner work — an event, a name and a date. Templates with
 * photography or illustration can be added later without changing this model;
 * `background` simply becomes an image the shop supplies.
 */
export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "open-house",
    name: "Open house",
    description: "Big headline, address and time underneath.",
    products: ["yard-sign", "rigid-sign"],
    background: "#1e3a5f",
    aspect: 4 / 3,
    fields: [
      {
        id: "headline",
        label: "Headline",
        maxLength: 14,
        placeholder: "OPEN HOUSE",
        defaultValue: "OPEN HOUSE",
        required: true,
        x: 0.5,
        y: 0.3,
        sizePct: 0.2,
        weight: 800,
        uppercase: true,
        color: "#ffffff",
      },
      {
        id: "address",
        label: "Address",
        maxLength: 28,
        placeholder: "12 Canal Street",
        defaultValue: "",
        x: 0.5,
        y: 0.56,
        sizePct: 0.11,
        weight: 700,
        color: "#ffd166",
      },
      {
        id: "detail",
        label: "Day and time",
        maxLength: 30,
        placeholder: "Sunday 12-2pm",
        defaultValue: "",
        x: 0.5,
        y: 0.75,
        sizePct: 0.09,
        weight: 600,
        color: "#ffffff",
      },
    ],
  },
  {
    id: "now-hiring",
    name: "Now hiring",
    description: "Headline, role and how to apply.",
    products: ["yard-sign", "rigid-sign", "vinyl-banner"],
    background: "#2e7d32",
    aspect: 2,
    fields: [
      {
        id: "headline",
        label: "Headline",
        maxLength: 14,
        placeholder: "NOW HIRING",
        defaultValue: "NOW HIRING",
        required: true,
        x: 0.5,
        y: 0.32,
        sizePct: 0.26,
        weight: 800,
        uppercase: true,
        color: "#ffffff",
      },
      {
        id: "role",
        label: "Role or detail",
        maxLength: 30,
        placeholder: "Line cooks & servers",
        defaultValue: "",
        x: 0.5,
        y: 0.62,
        sizePct: 0.13,
        weight: 700,
        color: "#ffffff",
      },
      {
        id: "contact",
        label: "How to apply",
        maxLength: 34,
        placeholder: "Apply inside",
        defaultValue: "",
        x: 0.5,
        y: 0.82,
        sizePct: 0.1,
        weight: 600,
        color: "#d7f5d9",
      },
    ],
  },
  {
    id: "grand-opening",
    name: "Grand opening",
    description: "Business name, the big line and a date.",
    products: ["vinyl-banner", "rigid-sign"],
    background: "#b23a2e",
    aspect: 2,
    fields: [
      {
        id: "business",
        label: "Business name",
        maxLength: 26,
        placeholder: "Gorilla Coffee",
        defaultValue: "",
        required: true,
        x: 0.5,
        y: 0.26,
        sizePct: 0.15,
        weight: 700,
        color: "#ffe9c7",
      },
      {
        id: "headline",
        label: "Headline",
        maxLength: 16,
        placeholder: "GRAND OPENING",
        defaultValue: "GRAND OPENING",
        required: true,
        x: 0.5,
        y: 0.56,
        sizePct: 0.24,
        weight: 800,
        uppercase: true,
        color: "#ffffff",
      },
      {
        id: "detail",
        label: "Date or detail",
        maxLength: 30,
        placeholder: "Saturday 9am",
        defaultValue: "",
        x: 0.5,
        y: 0.82,
        sizePct: 0.1,
        weight: 600,
        color: "#ffe9c7",
      },
    ],
  },
  {
    id: "plain-text",
    name: "Just words",
    description: "Two lines on a plain ground. Pick this if none of the others fit.",
    products: [],
    background: "#111111",
    aspect: 2,
    fields: [
      {
        id: "headline",
        label: "Main line",
        maxLength: 20,
        placeholder: "YARD SALE",
        defaultValue: "",
        required: true,
        x: 0.5,
        y: 0.4,
        sizePct: 0.26,
        weight: 800,
        uppercase: true,
        color: "#ffffff",
      },
      {
        id: "detail",
        label: "Second line",
        maxLength: 34,
        placeholder: "Saturday 8am - 2pm",
        defaultValue: "",
        x: 0.5,
        y: 0.7,
        sizePct: 0.12,
        weight: 600,
        color: "#f4f1ea",
      },
    ],
  },
];

export function getTemplate(templateId: string | null) {
  return DESIGN_TEMPLATES.find((entry) => entry.id === templateId) || null;
}

/** Templates offered for a sign product. Empty `products` means all of them. */
export function getTemplatesForProduct(productId: string) {
  return DESIGN_TEMPLATES.filter(
    (entry) => entry.products.length === 0 || entry.products.includes(productId)
  );
}

/**
 * What the customer still has to type.
 *
 * Only `required` fields block. The optional ones are genuinely optional —
 * an "OPEN HOUSE" sign with no time on it is a real sign somebody wants.
 */
export function getTemplateTextErrors(
  templateId: string | null,
  values: Record<string, string>
) {
  const template = getTemplate(templateId);
  if (!template) return {};

  const errors: Record<string, string> = {};

  for (const field of template.fields) {
    if (field.required && !(values[field.id] ?? field.defaultValue).trim()) {
      errors[field.id] = `Enter the ${field.label.toLowerCase()}.`;
    }
  }

  return errors;
}

/** The text as the shop will read it, with defaults resolved. */
export function resolveTemplateText(
  templateId: string | null,
  values: Record<string, string>
) {
  const template = getTemplate(templateId);
  if (!template) return [];

  return template.fields
    .map((field) => ({
      label: field.label,
      value: (values[field.id] ?? field.defaultValue).trim(),
    }))
    .filter((entry) => entry.value);
}
