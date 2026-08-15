/**
 * Kiosk mode — the order desk running on a machine in the shop.
 *
 * ── WHY THIS IS NOT JUST A CSS CLASS ──────────────────────────────────────
 * Every safe-by-default assumption in this app comes from one browser
 * belonging to one person. A shared terminal in the front of the shop breaks
 * all of them at once:
 *
 *   - State left behind is the PREVIOUS CUSTOMER's name, email and artwork,
 *     sitting on screen for whoever walks up next.
 *   - The abandoned-quote beacon fires whenever a page is hidden. On a kiosk
 *     that is every customer who wanders off, so the lead inbox fills with
 *     half-typed strangers.
 *   - The newsletter box ships pre-ticked. That is defensible when the person
 *     ticking it is the person whose address it is; it is not defensible when
 *     a member of staff is typing on someone else's behalf.
 *   - Stickers self-check-out by emailing a Printavo payment link. At a
 *     counter the customer is standing right there — and a mistyped address
 *     would send a live payment link to a stranger.
 *
 * So kiosk mode is a set of behaviour changes, and the ones that touch money
 * or consent are enforced on the SERVER, where a tampered payload cannot
 * reach them.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type KioskMode = "self" | "staff";

export type KioskSession = {
  mode: KioskMode;
  /** Who is writing this up. Empty for self-service. */
  staffName: string;
};

/**
 * Idle before a session is thrown away, and how long the warning shows.
 *
 * Deliberately generous. Somebody deciding between two vinyls should not lose
 * their order because they went quiet for a minute, and every reset is a
 * customer starting again from the beginning.
 */
export const KIOSK_IDLE_MS = 120_000;
export const KIOSK_WARNING_MS = 30_000;

/** Shorter on the confirmation screen — the order is already sent. */
export const KIOSK_DONE_IDLE_MS = 45_000;

/**
 * Whether a submitted order came from a kiosk.
 *
 * Read on the SERVER to decide whether the sticker payment link is generated.
 * A browser cannot be trusted with that decision, but it also cannot be
 * exploited into a worse outcome here: the only thing claiming kiosk gets you
 * is NOT being emailed a payment link.
 */
export function isKioskOrder(order: Record<string, unknown>) {
  const kiosk = order.kiosk as Record<string, unknown> | undefined;
  return Boolean(kiosk && (kiosk.mode === "self" || kiosk.mode === "staff"));
}

/** The kiosk session on a submitted order, or null for an ordinary web quote. */
export function readKioskSession(
  order: Record<string, unknown>
): KioskSession | null {
  if (!isKioskOrder(order)) return null;

  const kiosk = order.kiosk as Record<string, unknown>;

  return {
    mode: kiosk.mode === "staff" ? "staff" : "self",
    staffName: String(kiosk.staffName || "").slice(0, 80),
  };
}

/** How the shop should describe where this order came from. */
export function describeKioskSource(session: KioskSession | null) {
  if (!session) return null;

  return session.mode === "staff"
    ? `In-store kiosk — written up by ${session.staffName || "a staff member"}`
    : "In-store kiosk — customer self-service";
}
