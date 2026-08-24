"use client";

import { useState } from "react";

type Props = {
  onCancel: () => void;
  onSignedIn: (name: string) => void;
};

/**
 * Order Desk — unlock staff mode.
 *
 * Two fields, because both answers are needed and neither can be guessed. The
 * PIN says a member of staff is at the keyboard; the name says WHICH ONE, so
 * a question about a job three days later has somebody to go to.
 *
 * The PIN is checked on the server (app/api/kiosk-auth) so it never ships in
 * the bundle sitting on the machine in the lobby.
 */
export default function StaffGate({ onCancel, onSignedIn }: Props) {
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Enter your name so the order says who took it.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/kiosk-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setError(result?.message || "That PIN didn't work.");
        setPin("");
        return;
      }

      onSignedIn(name.trim());
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-gate-title"
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--ink-black)]/70 p-6 pt-24"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md border border-[var(--rule)] bg-[var(--paper)] p-6"
      >
        <p className="eyebrow">Staff</p>
        <h2
          id="staff-gate-title"
          className="mt-2 text-lede font-bold text-[var(--ink-black)]"
        >
          Write up an order for a customer
        </h2>
        <p className="mt-1 text-fine text-[var(--ink-muted)]">
          The order records who took it, and nothing is charged automatically —
          you take payment at the counter as usual.
        </p>

        <label
          htmlFor="staff-name"
          className="mt-5 block text-fine font-bold text-[var(--ink-black)]"
        >
          Your name
        </label>
        <input
          id="staff-name"
          type="text"
          value={name}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
        />

        <label
          htmlFor="staff-pin"
          className="mt-4 block text-fine font-bold text-[var(--ink-black)]"
        >
          Staff PIN
        </label>
        <input
          id="staff-pin"
          // Numeric keypad on a tablet, and not stored by the browser on a
          // machine the public uses.
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-lg tracking-[0.3em] text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
        />

        {error && (
          <p
            role="alert"
            className="mt-3 bg-[var(--surface-warn)] p-3 text-fine font-bold text-[var(--ink-warn)]"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="min-h-[56px] flex-1 cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 text-body font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)] disabled:opacity-60"
          >
            {busy ? "Checking…" : "Start writing up"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[56px] cursor-pointer border border-[var(--rule)] px-5 text-fine font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
