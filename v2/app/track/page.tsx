"use client";

import { useState } from "react";

import Header from "../../components/Header";
import { STEP_LABELS } from "../../lib/order-status";

type Status = {
  quoteNumber: string;
  label: string;
  detail: string;
  stage: string;
  step: number | null;
  totalSteps: number;
  complete: boolean;
};

/**
 * Order Desk — "where is my order?"
 *
 * The whole page answers one question, so it asks for exactly what it needs
 * to answer it and shows exactly one thing back. Anything else here — a
 * price, a reprint button, an artwork thumbnail — would be a second feature
 * standing in front of the answer somebody opened the page for.
 */
export default function TrackPage() {
  const [quoteNumber, setQuoteNumber] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus(null);

    try {
      const response = await fetch("/api/order-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteNumber, email }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setError(result?.message || "Something went wrong. Try again shortly.");
        return;
      }

      setStatus(result);
    } catch {
      setError(
        "Couldn't reach us just now — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8 sm:py-16">
        <p className="eyebrow">Order tracker</p>
        <h1 className="mt-2 text-display font-bold tracking-[-0.06em] text-[var(--ink-black)]">
          Where&rsquo;s my order?
        </h1>
        <p className="mt-3 text-lede text-[var(--ink-muted)]">
          Enter your order number and the email your confirmation went to.
        </p>

        <form
          onSubmit={check}
          className="mt-8 border border-[var(--rule)] bg-[var(--paper)] p-6"
        >
          <label
            htmlFor="track-number"
            className="block text-sm font-bold text-[var(--ink-black)]"
          >
            Order number
          </label>
          <input
            id="track-number"
            value={quoteNumber}
            onChange={(event) => setQuoteNumber(event.target.value)}
            placeholder="GS-20260812-AB12C"
            autoComplete="off"
            // Uppercase on the way in: the number is printed uppercase on the
            // confirmation, and nobody should fail a lookup over shift key.
            onBlur={(event) => setQuoteNumber(event.target.value.toUpperCase())}
            className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
          />

          <label
            htmlFor="track-email"
            className="mt-4 block text-sm font-bold text-[var(--ink-black)]"
          >
            Email on the order
          </label>
          <input
            id="track-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-5 min-h-[44px] w-full cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 py-3 text-base font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)] active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-60"
          >
            {busy ? "Checking…" : "Check my order"}
          </button>

          {error && (
            <p
              role="alert"
              className="mt-4 bg-[var(--surface-warn)] p-3 text-sm font-bold leading-5 text-[var(--ink-warn)]"
            >
              {error}
            </p>
          )}
        </form>

        {status && <StatusCard status={status} />}

        <p className="mt-8 text-sm text-[var(--ink-muted)]">
          Can&rsquo;t find your number? It&rsquo;s at the top of your
          confirmation email. Reply to that email and we&rsquo;ll look it up.
        </p>
      </div>
    </main>
  );
}

function StatusCard({ status }: { status: Status }) {
  const onHold = status.stage === "hold";

  return (
    <section
      // Announced, because the answer arrives without the page moving and a
      // screen-reader user would otherwise not know it had.
      aria-live="polite"
      className={`mt-6 border bg-[var(--paper)] p-6 ${
        onHold
          ? "border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)]"
          : "border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)]"
      }`}
    >
      <p className="spec text-fine uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        {status.quoteNumber}
      </p>

      <h2 className="mt-2 text-lede font-bold text-[var(--ink-black)]">
        {status.label}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
        {status.detail}
      </p>

      {/* Only drawn when we know where in the run this order is. An order on
          hold, or one whose status we do not recognise, gets no bar at all —
          a progress display guessing at a position is a confident lie, and
          this is the screen someone opens when they are already unsure. */}
      {status.step !== null && (
        <ol className="mt-6 grid grid-cols-4 gap-1">
          {STEP_LABELS.map((label, index) => {
            const position = index + 1;
            const done = status.step !== null && position <= status.step;

            return (
              <li key={label} className="min-w-0">
                <div
                  className={`h-2 ${
                    done ? "bg-[var(--gorilla-green)]" : "bg-[var(--rule)]"
                  }`}
                />
                {/* The tick is not decoration — colour alone must never be
                    the only signal that a step is done. */}
                <p
                  className={`mt-2 truncate text-fine font-bold ${
                    done
                      ? "text-[var(--ink-black)]"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  {done ? "✓ " : ""}
                  {label}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {status.complete && (
        <p className="mt-6 border-t border-[var(--rule)] pt-4 text-sm font-bold text-[var(--gorilla-green-dark)]">
          This order is finished. Need the same again? Start a new quote and
          mention the order number — we keep your artwork on file.
        </p>
      )}
    </section>
  );
}
