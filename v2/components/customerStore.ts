/**
 * The customer's own contact details, on their own device.
 *
 * An external store rather than state-plus-an-effect, for the same reason
 * components/kiosk/staffStore.ts is: localStorage cannot be read while
 * rendering on the server, so the naive version renders empty and corrects
 * itself in an effect. Here that would be a visible flash of blank boxes
 * before the prefill lands.
 *
 * WHAT IS STORED IS DECIDED IN lib/remembered-contact.ts, not here. This file
 * is the plumbing; that one is the policy, and it is the one with the tests.
 */

import {
  parseRememberedContact,
  serialiseContact,
  type RememberedContact,
} from "../lib/remembered-contact";

const KEY = "gorilla.customer.contact";

const listeners = new Set<() => void>();

/**
 * useSyncExternalStore compares snapshots by identity and re-renders forever
 * if a fresh object comes back each call. So the parsed record is cached
 * against the raw string it came from, and only re-parsed when that changes.
 */
let cachedRaw: string | null = null;
let cachedContact: RememberedContact | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeCustomer(listener: () => void) {
  listeners.add(listener);
  // Cleared in another tab should clear here too.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getCustomerSnapshot(): RememberedContact | null {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private browsing, or storage disabled by policy. Nothing remembered is
    // the safe reading: the form works exactly as it always has.
    return null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedContact = parseRememberedContact(raw);
  }

  return cachedContact;
}

/** Always nothing — the server cannot know, and must not guess. */
export function getCustomerServerSnapshot(): RememberedContact | null {
  return null;
}

export function rememberCustomer(contact: RememberedContact) {
  try {
    window.localStorage.setItem(KEY, serialiseContact(contact));
  } catch {
    // Not remembering is a nuisance. Failing the order over it would not be.
  }
  emit();
}

export function forgetCustomer() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — if it cannot be removed it could not have been written.
  }
  emit();
}
