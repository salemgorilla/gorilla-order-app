"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { KIOSK_DONE_IDLE_MS, KIOSK_WARNING_MS } from "../../lib/kiosk";

type Props = {
  idleMs: number;
  /** True once the order is sent — nothing is at stake, so clear down sooner. */
  finished: boolean;
  onReset: () => void;
};

/**
 * Order Desk — wipe the kiosk when nobody is using it.
 *
 * The thing being protected is the NEXT customer walking up to the previous
 * one's name, email address and artwork. That is the whole reason this exists,
 * and it is why the timer runs on the shop's terms rather than the customer's.
 *
 * It always warns first, and any touch cancels it. Silently discarding an
 * order somebody spent five minutes on — because they were reading the
 * material descriptions, or talking to whoever they came in with — would be a
 * worse failure than leaving it up a little longer.
 */
export default function IdleReset({ idleMs, finished, onReset }: Props) {
  const limit = finished ? KIOSK_DONE_IDLE_MS : idleMs;
  const [remaining, setRemaining] = useState<number | null>(null);
  const deadlineRef = useRef<number>(0);

  const restart = useCallback(() => {
    deadlineRef.current = Date.now() + limit;
    setRemaining(null);
  }, [limit]);

  useEffect(() => {
    // A ref write, not restart(): calling setState in an effect body cascades
    // a render, and there is nothing to show yet anyway — the warning only
    // appears once the interval below finds the clock running down.
    deadlineRef.current = Date.now() + limit;

    const events = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "input",
    ] as const;

    // Any sign of life restarts the clock. `input` is in there because filling
    // a long text field without ever clicking is a real way to sit "idle"
    // while very much using the machine.
    for (const event of events) {
      window.addEventListener(event, restart, { passive: true });
    }

    const tick = window.setInterval(() => {
      const left = deadlineRef.current - Date.now();

      if (left <= 0) {
        onReset();
        restart();
        return;
      }

      setRemaining(left <= KIOSK_WARNING_MS ? left : null);
    }, 1000);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, restart);
      }
      window.clearInterval(tick);
    };
  }, [restart, onReset, limit]);

  if (remaining === null) return null;

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div
      // Announced, not just displayed. Someone who cannot see the panel still
      // needs to know their order is about to be cleared.
      role="alertdialog"
      aria-live="assertive"
      aria-label="This quote is about to be cleared"
      className="fixed inset-x-0 bottom-0 z-50 border-t-4 border-[var(--rush-red)] bg-[var(--paper)] p-5 shadow-none"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4">
        <div className="mr-auto">
          <p className="text-lede font-bold text-[var(--ink-black)]">
            Still there?
          </p>
          <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
            {finished
              ? "Clearing the screen for the next customer"
              : "This quote will be cleared"}{" "}
            in <span className="spec">{seconds}s</span>. Touch anywhere to keep
            going.
          </p>
        </div>

        <button
          type="button"
          onClick={restart}
          className="min-h-[56px] cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 text-body font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)]"
        >
          I&rsquo;m still here
        </button>

        <button
          type="button"
          onClick={onReset}
          className="min-h-[56px] cursor-pointer border border-[var(--rule)] px-5 text-fine font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
        >
          Clear it now
        </button>
      </div>
    </div>
  );
}
