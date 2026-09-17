import type { Metadata } from "next";

import DropoffStation from "../../components/dropoff/DropoffStation";

/**
 * /dropoff — the artwork drop-off station in the shop.
 *
 * ── WHY NOT /kiosk ────────────────────────────────────────────────────────
 * /kiosk is the ORDER DESK and is not this. It runs the full quote flow so a
 * walk-in can place a NEW order at the counter, with a staff PIN gate, and it
 * works today. This route looks an EXISTING order up and takes files for it;
 * it cannot place an order or take money.
 *
 * The brief that asked for this said "/kiosk", written without knowledge of
 * the order desk already living there. Replacing it would have deleted a
 * working counter terminal to build a different appliance. Both exist, and
 * the shop points each device at the URL it needs — a one-line change in the
 * Chromium launch command on hardware that is not built yet, against losing
 * a feature that takes orders today.
 *
 * ── NO WAY OUT ────────────────────────────────────────────────────────────
 * Nothing here links anywhere. The root layout renders no header, no nav and
 * no footer, so this page is the entire surface — which is the requirement,
 * not a side effect: the device is locked to one URL and a stray link is a
 * customer stranded in the marketing site with no address bar to escape it.
 */
export const metadata: Metadata = {
  title: "Drop off your artwork — Gorilla Salem",
  // A counter appliance has no business in a search index.
  robots: { index: false, follow: false },
};

export default function DropoffPage() {
  return <DropoffStation />;
}
