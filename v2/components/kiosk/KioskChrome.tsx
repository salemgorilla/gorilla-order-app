"use client";

import type { KioskMode } from "../../lib/kiosk";

type Props = {
  mode: KioskMode;
  staffName: string;
  onStartNew: () => void;
  onOpenStaffGate: () => void;
  onSignOutStaff: () => void;
};

/**
 * Order Desk — the bar across the top of the kiosk.
 *
 * Two jobs, and only two. It says whose session this is, and it gives the one
 * control that matters on a shared machine: start again, now, without hunting
 * for it. "Start a new order" is deliberately the largest thing here — the
 * person who needs it most is a customer who has walked up to someone else's
 * half-finished order and wants it gone.
 *
 * Staff mode is a strip of INK, not a badge or a coloured dot. Anyone glancing
 * at the screen from across the counter can tell which mode it is in, and it
 * cannot be missed by someone who does not distinguish colours.
 */
export default function KioskChrome({
  mode,
  staffName,
  onStartNew,
  onOpenStaffGate,
  onSignOutStaff,
}: Props) {
  const staff = mode === "staff";

  return (
    <header
      className={`sticky top-0 z-40 border-b border-[var(--rule)] ${
        staff
          ? "bg-[var(--ink-black)] text-[var(--paper)]"
          : "bg-[var(--paper)] text-[var(--ink-black)]"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
        <div className="mr-auto">
          <p className="spec text-fine uppercase tracking-eyebrow opacity-70">
            Gorilla Salem — order desk
          </p>
          <p className="text-fine font-bold">
            {staff ? (
              <>Writing up an order{staffName ? ` — ${staffName}` : ""}</>
            ) : (
              <>Build your quote</>
            )}
          </p>
        </div>

        {/* 56px, not the 44px floor. This is a touch target on a counter that
            people reach across, often while holding something. */}
        <button
          type="button"
          onClick={onStartNew}
          className="min-h-[56px] cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 text-body font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)] active:translate-x-[2px] active:translate-y-[2px]"
        >
          Start a new quote
        </button>

        {staff ? (
          <button
            type="button"
            onClick={onSignOutStaff}
            className="min-h-[56px] cursor-pointer border border-current px-5 text-fine font-bold transition-colors duration-[120ms] ease-linear hover:bg-[var(--paper)] hover:text-[var(--ink-black)]"
          >
            Hand back to customers
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenStaffGate}
            className="min-h-[56px] cursor-pointer border border-[var(--rule)] px-5 text-fine font-bold transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
          >
            Staff
          </button>
        )}
      </div>
    </header>
  );
}
