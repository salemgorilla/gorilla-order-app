"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { getTrackUrl } from "../../lib/order-status";
import {
  describeCustomerRecord,
  type CustomerRecordNote,
} from "../../lib/customer-record";

type Props = {
  quoteNumber: string;
  /** The address the order is filed under. Blank is possible and handled. */
  email: string;
  /**
   * What Printavo did with the customer's record. Null when the quote never
   * reached Printavo, in which case there is nothing honest to report.
   */
  customerRecord?: Parameters<typeof describeCustomerRecord>[0] | null;
};

/**
 * What the customer at the counter leaves with.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * A walk-in gets NO email from this system. The server suppresses the
 * Printavo payment request on a kiosk order deliberately — see lib/kiosk.ts:
 * emailing a live payment link to somebody standing in front of you, at an
 * address a member of staff typed by ear, is the hazard that rule exists for.
 *
 * The consequence nobody had joined up: that email is also the ONLY place a
 * customer is ever told their GS- number. So the counter customer walked out
 * with nothing, and /track — which needs the number AND the email — was
 * unusable to exactly the people who had just paid in full.
 *
 * This screen is therefore the one and only moment they can be told. It is
 * shown while they are still standing there, and the kiosk wipes it 45
 * seconds after the order is sent, so it has to be readable across a counter
 * at a glance.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Everything here is a READ of what they already gave us. No payment link is
 * rendered and none exists — on a kiosk order there is nothing to render.
 */
export default function KioskPickupCard({
  quoteNumber,
  email,
  customerRecord,
}: Props) {
  const record: CustomerRecordNote | null = customerRecord
    ? describeCustomerRecord(customerRecord)
    : null;

  const [qrSvg, setQrSvg] = useState("");

  const trackUrl = getTrackUrl(quoteNumber);

  useEffect(() => {
    let cancelled = false;

    // SVG rather than a canvas image, matching ArtworkHandoff: it stays crisp
    // at whatever size the counter screen is, and a blurry QR is one a phone
    // will not read.
    QRCode.toString(trackUrl, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      // A missing QR is a nuisance; the number and the URL below are printed
      // in full and are what actually matter.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [trackUrl]);

  return (
    <div className="mt-8 border border-[var(--ink-black)] bg-[var(--paper)] p-6 text-left sm:p-8">
      <p className="eyebrow">Before they leave</p>

      <div className="mt-5 flex flex-wrap items-start gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-fine text-[var(--ink-muted)]">Order number</p>

          {/* Mono and large. It is a real value, and it has to be readable
              from the customer's side of the counter to be copied down. */}
          <p className="spec mt-1 break-all text-[clamp(1.4rem,4vw,2rem)] font-bold leading-tight text-[var(--ink-black)]">
            {quoteNumber}
          </p>

          <p className="mt-5 text-fine text-[var(--ink-muted)]">
            Check progress at
          </p>
          <p className="spec mt-1 break-all text-sm font-bold text-[var(--ink-black)]">
            {trackUrl}
          </p>

          {email ? (
            <p className="mt-4 border-l-2 border-[var(--rule)] pl-3 text-fine leading-5 text-[var(--ink-muted)]">
              They will need this order number and{" "}
              <span className="spec font-bold text-[var(--ink-black)]">
                {email}
              </span>{" "}
              to open it. The link fills the number in; the address is asked
              for on the page.
            </p>
          ) : (
            /* No address means no tracker access, so say it now rather than
               letting them find out at home. */
            <p className="mt-4 border-l-2 border-[var(--rush-red)] pl-3 text-fine leading-5 text-[var(--rush-red)]">
              No email address on this order, so the tracker cannot be opened.
              Add one in Printavo if they want to check progress online.
            </p>
          )}
        </div>

        {qrSvg && (
          <div
            className="w-40 shrink-0 border border-[var(--rule)] bg-white p-3 sm:w-44"
            aria-label="Scan to track this order"
            // A complete, self-contained SVG built by the library from a URL
            // this component just constructed. No customer input reaches it.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}
      </div>

      {/* For the member of staff, not the customer. Kept last and plainly
          marked, because the block above is the one being read aloud. */}
      <div className="mt-6 border-t border-[var(--rule)] pt-4">
        <p className="text-fine font-bold text-[var(--ink-black)]">
          STAFF: take payment in full now — no payment link was emailed.
        </p>

        {/* Only useful while the customer is still standing here. Matching is
            email-only, so a returning customer who gave a different address
            has just become a second record — and this is the last moment
            anybody can ask. */}
        {record && (
          <p
            className={`mt-3 border-l-2 pl-3 text-fine leading-5 ${
              record.attention
                ? "border-[var(--rush-red)] text-[var(--rush-red)]"
                : "border-[var(--rule)] text-[var(--ink-muted)]"
            }`}
          >
            <span className="spec font-bold">{record.label}.</span>{" "}
            {record.detail}
          </p>
        )}
      </div>
    </div>
  );
}
