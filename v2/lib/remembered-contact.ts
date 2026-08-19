/**
 * What we are allowed to remember about a customer, on their own device.
 *
 * ── WHY THE RULES ARE HERE AND NOT IN THE COMPONENT ───────────────────────
 * Two of them are safety properties, and a safety property that lives inside
 * a React component is a safety property nothing can check:
 *
 *   1. ONLY contact fields are ever written. Not artwork, not the order, not
 *      anything priced.
 *   2. Newsletter consent is NEVER remembered — not written, not read back.
 *      Consent is re-asked every time. A remembered tick is a tick nobody
 *      made today.
 *
 * Rule 1 is enforced by CONSTRUCTION rather than by remembering to be careful:
 * `toRememberedContact` builds a new object from four named fields, so a
 * caller that hands it the whole customer record — which is the obvious
 * mistake, and the one that would leak consent — still writes only four
 * fields. There is no spread anywhere in this file, deliberately.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** The only four fields that may be stored. */
export type RememberedContact = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
};

const FIELDS = ["customerName", "company", "email", "phone"] as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build the storable record from whatever the caller has.
 *
 * Returns null when there is nothing worth remembering — an empty record
 * would offer "filled in from your last order" over four blank boxes.
 */
export function toRememberedContact(
  input: Record<string, unknown>
): RememberedContact | null {
  const contact: RememberedContact = {
    customerName: text(input.customerName),
    company: text(input.company),
    email: text(input.email),
    phone: text(input.phone),
  };

  // The name and the address are the two worth the prompt. A lone phone
  // number is not a customer we recognised.
  if (!contact.customerName && !contact.email) return null;

  return contact;
}

/** Serialise for storage. Only ever the four fields. */
export function serialiseContact(contact: RememberedContact) {
  return JSON.stringify(contact);
}

/**
 * Read a stored record back, defensively.
 *
 * Anything unparseable, any shape that is not an object, and any extra key
 * that has crept in are all treated the same way: take the four fields we
 * know and ignore the rest. A stored record is attacker-controlled in the
 * sense that anyone with the customer's device can edit it, and it is old in
 * the sense that a past version of this app wrote it.
 */
export function parseRememberedContact(
  raw: string | null
): RememberedContact | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return toRememberedContact(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Should a remembered record be offered at all?
 *
 * `isKiosk` is the whole of the second safety property, and it is passed in
 * rather than detected here so there is exactly one way of knowing — see the
 * header of lib/kiosk.ts. On a shared terminal the previous customer's name
 * and address sitting in the boxes for whoever walks up next is the precise
 * failure kiosk mode was built to prevent, and a prefill would survive the
 * remount that throws the rest of the state away.
 */
export function shouldOfferRememberedContact(input: {
  isKiosk: boolean;
  contact: RememberedContact | null;
}) {
  if (input.isKiosk) return false;
  return Boolean(input.contact);
}

/**
 * The fields to apply, given what the customer has already typed.
 *
 * Never overwrites. Somebody who has started filling the form in is telling
 * us something more recent than storage is, and a prefill that clobbered a
 * half-typed address would be worse than no prefill at all.
 */
export function applyRememberedContact(
  contact: RememberedContact,
  current: Record<string, unknown>
): Partial<RememberedContact> {
  const updates: Partial<RememberedContact> = {};

  for (const field of FIELDS) {
    if (!text(current[field]) && contact[field]) {
      updates[field] = contact[field];
    }
  }

  return updates;
}
