"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import Header from "../../components/Header";

/**
 * "STOP EMAILING ME" — one page, one button, no account.
 *
 * ── WHY THIS IS A PAGE AND NOT A LINK THAT JUST DOES IT ──────────────────
 * Mail clients, corporate link scanners and preview generators fetch URLs
 * found in a message with no human involved. An unsubscribe that acts on a
 * GET is an unsubscribe that happens to people who never clicked — and they
 * find out when the emails stop, if ever.
 *
 * So the emailed link lands here and one press finishes it. That is still
 * one click for a human, and zero for a scanner.
 *
 * ── AND WHY IT ASKS FOR NOTHING ──────────────────────────────────────────
 * No login, no "tell us why", no "manage your preferences" with the real
 * button three screens in. Somebody who reached this page has already
 * decided, and every extra step between them and the button is a step
 * towards them pressing "spam" instead — which costs the shop's whole
 * sending reputation rather than one subscriber.
 */
function UnsubscribeForm() {
  const params = useSearchParams();

  const email = (params.get("e") || "").trim();
  const token = (params.get("t") || "").trim();

  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unsubscribe() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setError(
          result?.message ||
            "That link didn't work. Reply to any email from us and we'll take you off by hand."
        );
        return;
      }

      setDone(true);
    } catch {
      setError(
        "Couldn't reach us just now. Reply to any email from us and we'll take you off by hand."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8 sm:py-16">
        <p className="eyebrow">Newsletter</p>

        {done ? (
          <>
            <h1 className="mt-2 text-hero font-bold tracking-display text-[var(--ink-black)]">
              You&rsquo;re off the list.
            </h1>
            <p className="mt-3 text-lede text-[var(--ink-muted)]">
              We won&rsquo;t send you any more shop news. That&rsquo;s it —
              nothing else to do.
            </p>
            {/* The one thing they might now worry about. Somebody with an
                order in the shop needs to know they have not just switched
                off the emails about it. */}
            <p className="mt-6 border border-[var(--rule)] bg-[var(--paper)] p-4 text-fine leading-6 text-[var(--ink-muted)]">
              You&rsquo;ll still get emails about any order you place with us —
              your quote, your proof and your receipt. Those aren&rsquo;t
              marketing, and this doesn&rsquo;t turn them off.
            </p>
          </>
        ) : !email || !token ? (
          <>
            <h1 className="mt-2 text-hero font-bold tracking-display text-[var(--ink-black)]">
              That link is incomplete.
            </h1>
            <p className="mt-3 text-lede text-[var(--ink-muted)]">
              Some email apps cut long links in half. Reply to any email from
              us with the word &ldquo;unsubscribe&rdquo; and we&rsquo;ll take
              you off by hand — same day.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-hero font-bold tracking-display text-[var(--ink-black)]">
              Unsubscribe?
            </h1>
            <p className="mt-3 text-lede text-[var(--ink-muted)]">
              We&rsquo;ll stop sending shop news to{" "}
              <span className="spec font-bold text-[var(--ink-black)]">
                {email}
              </span>
              .
            </p>

            <button
              type="button"
              onClick={unsubscribe}
              disabled={busy}
              className="mt-8 min-h-[44px] w-full cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 py-3 text-body font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)] active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-60"
            >
              {busy ? "Taking you off…" : "Unsubscribe me"}
            </button>

            <p className="mt-4 text-fine leading-6 text-[var(--ink-muted)]">
              Emails about an order you&rsquo;ve placed — your quote, your
              proof, your receipt — aren&rsquo;t affected.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-4 bg-[var(--surface-warn)] p-3 text-fine font-bold leading-5 text-[var(--ink-warn)]"
              >
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  // Suspense boundary for useSearchParams — without one the whole route
  // opts out of static rendering and the build fails. Same shape as /track.
  return (
    <Suspense fallback={null}>
      <UnsubscribeForm />
    </Suspense>
  );
}
