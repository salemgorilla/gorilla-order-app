/**
 * Who is signed in at the kiosk, held in localStorage.
 *
 * An external store rather than state-plus-an-effect. localStorage cannot be
 * read while rendering on the server, so the naive version renders "nobody",
 * then corrects itself in an effect — a cascading render, and a flash of the
 * self-service bar on a terminal that is signed in to staff mode.
 *
 * useSyncExternalStore is built for exactly this: the server snapshot is
 * honestly "nobody", the client reads the real value before paint, and a sign
 * in or out in one place updates every reader.
 */

const KEY = "gorilla.kiosk.staffName";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeStaff(listener: () => void) {
  listeners.add(listener);
  // Another tab signing out should sign this one out too — a shop with two
  // terminals open on the same account should not disagree about who is on.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getStaffSnapshot() {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    // Private browsing, or storage disabled by policy. Signed out is the safe
    // reading: it offers self-service, which is the mode that assumes least.
    return "";
  }
}

/** Always "nobody" — the server cannot know, and must not guess. */
export function getStaffServerSnapshot() {
  return "";
}

export function setStaff(name: string) {
  try {
    if (name) window.localStorage.setItem(KEY, name);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Not being able to remember the name across a refresh is a nuisance;
    // failing the sign-in over it would be worse.
  }
  emit();
}
