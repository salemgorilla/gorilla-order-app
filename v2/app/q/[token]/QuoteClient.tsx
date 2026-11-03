"use client";

import { useEffect, useRef, useState } from "react";

import type { PublicQuote } from "../../../lib/quote-link";

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The customer's quote page.
 *
 * Every figure on screen comes from the server. The browser sends sizes and
 * receives a whole PublicQuote back; it never computes a price. Approval
 * sends the sizes on screen with it, so a debounce still in flight cannot
 * leave the approved sizes behind what the customer is looking at.
 */
export default function QuoteClient({ token, initial }: { token: string; initial: PublicQuote }) {
  const [quote, setQuote] = useState(initial);
  const [entered, setEntered] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial.entered).map(([k, v]) => [k, String(v)]))
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<"" | "approve" | "pay">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function toSizes(values: Record<string, string>) {
    const out: Record<string, number> = {};
    for (const [size, raw] of Object.entries(values)) {
      // Zeros are fine to send: the server drops them.
      if (raw.trim() !== "") out[size] = Number(raw);
    }
    return out;
  }

  function change(size: string, raw: string) {
    const next = { ...entered, [size]: raw };
    setEntered(next);
    setError("");
    setSaving(true);

    if (timer.current) clearTimeout(timer.current);
    const mine = ++sequence.current;

    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/q/${token}/sizes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sizes: toSizes(next) }),
        });
        const data = await res.json();
        // A slower, older response must not overwrite a newer one.
        if (mine !== sequence.current) return;

        if (data.ok) {
          setQuote(data.quote);
        } else {
          setError(data.error ?? "Something went wrong.");
        }
      } catch {
        if (mine === sequence.current) setError("We couldn't reach the server. Check your connection.");
      } finally {
        if (mine === sequence.current) setSaving(false);
      }
    }, 400);
  }

  async function approve() {
    setBusy("approve");
    setError("");
    try {
      const res = await fetch(`/api/q/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, agreed, sizes: toSizes(entered) }),
      });
      const data = await res.json();
      if (data.ok) setQuote(data.quote);
      else setError(data.error ?? "Something went wrong.");
    } catch {
      setError("We couldn't reach the server. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  async function pay() {
    setBusy("pay");
    setError("");
    try {
      const res = await fetch(`/api/q/${token}/checkout`, { method: "POST" });
      const data = await res.json();
      // Off to Stripe's own page; it brings them back to /thanks.
      if (data.ok && typeof data.url === "string" && data.url.startsWith("https://")) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? "Something went wrong.");
    } catch {
      setError("We couldn't reach the server. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  const p = quote.price;
  const locked = quote.locked;
  const canApprove = !locked && !quote.belowMinimum && !saving && p.pieces > 0;
  const field =
    "min-h-[44px] w-full border border-[var(--ink-black)] bg-[var(--paper)] px-3 text-value";
  const button =
    "min-h-[44px] w-full cursor-pointer border-2 border-[var(--ink-black)] bg-[var(--gorilla-green)] px-4 font-bold text-white transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)] disabled:cursor-not-allowed disabled:opacity-40";
  const card = "border border-[var(--rule)] bg-[var(--paper)] p-5";

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-[var(--ink-black)] bg-[var(--shirt-blank)] py-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4">
          <p className="text-wordmark font-bold tracking-display">
            GORILLA<span className="text-[var(--gorilla-green)]">PRINTING</span>
          </p>
          <p className="spec text-spec uppercase tracking-eyebrow">Order #{quote.orderNumber}</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <h1 className="text-head font-bold tracking-display">
          {quote.customerName ? `${quote.customerName.split(" ")[0]}, here's your quote` : "Your quote"}
        </h1>

        {quote.spec.imageUrl && (
          <div className={`${card} flex justify-center`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={quote.spec.imageUrl}
              alt={`${quote.spec.styleLabel} in ${quote.spec.colorName}`}
              className="max-h-80 w-auto"
            />
          </div>
        )}

        <section className={card} aria-label="Garment">
          <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
            {quote.spec.brand}
          </p>
          <p className="text-value font-bold">
            {quote.spec.styleLabel} - {quote.spec.colorName}
          </p>
          <p className="mt-2 text-body text-[var(--ink-muted)]">
            {quote.spec.method}: {quote.spec.printLocations.join(", ")}, {quote.spec.inkColors}
            {quote.spec.hasUnderbase ? " (white underbase)" : ""}
          </p>
        </section>

        <section className={card} aria-label="Sizes">
          <h2 className="text-value font-bold">Sizes</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quote.sizes.map((s) => (
              <label key={s.sizeName} className="flex flex-col gap-1">
                <span className="spec text-spec font-semibold">
                  {s.sizeName}
                  {s.upcharge > 0 && (
                    <span className="ml-1 font-medium text-[var(--ink-muted)]">
                      +{money(s.upcharge)}
                    </span>
                  )}
                </span>
                <input
                  className={`${field} spec disabled:opacity-60`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={locked || !s.available}
                  placeholder={s.available ? "0" : "n/a"}
                  value={entered[s.sizeName] ?? ""}
                  onChange={(e) => change(s.sizeName, e.target.value.replace(/[^0-9]/g, ""))}
                  aria-label={`${s.sizeName} quantity`}
                />
              </label>
            ))}
          </div>
          {locked && (
            <p className="mt-3 text-fine text-[var(--ink-muted)]">
              Approved - sizes are locked. Call us if something needs to change.
            </p>
          )}
        </section>

        <section className={card} aria-label="Totals" aria-live="polite">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-body">
            <dt>Pieces</dt><dd className="spec text-right font-bold">{p.pieces}</dd>
            <dt>Garments</dt><dd className="spec text-right">{money(p.garmentTotal)}</dd>
            <dt>Printing</dt><dd className="spec text-right">{money(p.decorationTotal)}</dd>
            <dt>Screens / setup</dt><dd className="spec text-right">{money(p.setupTotal)}</dd>
            {p.rushTotal > 0 && (<><dt>Rush</dt><dd className="spec text-right">{money(p.rushTotal)}</dd></>)}
            {p.cardFee > 0 && (<><dt>Card processing (3%)</dt><dd className="spec text-right">{money(p.cardFee)}</dd></>)}
            {p.tax > 0 && (<><dt>Tax</dt><dd className="spec text-right">{money(p.tax)}</dd></>)}
            <dt className="border-t border-[var(--rule-faint)] pt-2 text-value font-bold">Total</dt>
            <dd className="spec border-t border-[var(--rule-faint)] pt-2 text-right text-value font-bold">
              {saving ? "..." : money(p.total)}
            </dd>
            {p.pieces > 0 && (<><dt className="text-fine text-[var(--ink-muted)]">Per piece</dt>
              <dd className="spec text-right text-fine text-[var(--ink-muted)]">{money(p.perPiece)}</dd></>)}
            {p.deposit && p.pieces > 0 && (
              <><dt className="font-bold">Deposit due now ({p.deposit.percent}%)</dt>
                <dd className="spec text-right font-bold">{money(p.amountDue)}</dd></>
            )}
          </dl>
          {quote.belowMinimum && !locked && (
            <p className="mt-3 border border-[var(--rule)] bg-[var(--surface-rush)] p-3 text-fine font-bold text-[var(--rush-red-dark)]">
              {quote.belowMinimum}
            </p>
          )}
        </section>

        {quote.turnaroundNote && (
          <p className="text-body text-[var(--ink-muted)]">{quote.turnaroundNote}</p>
        )}

        {error && (
          <p role="alert" className="border border-[var(--rule)] bg-[var(--surface-rush)] p-3 text-fine font-bold text-[var(--rush-red-dark)]">
            {error}
          </p>
        )}

        {!locked && (
          <section className={card} aria-label="Approve">
            <h2 className="text-value font-bold">Approve</h2>
            <div className="mt-3 flex flex-col gap-3">
              <input className={field} placeholder="Your full name" autoComplete="name"
                value={name} onChange={(e) => setName(e.target.value)} />
              <input className={field} placeholder="Your email" type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="flex items-start gap-3 text-body">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)} />
                I approve this mockup, sizes, and price.
              </label>
              <button className={button} disabled={!canApprove || busy !== ""} onClick={approve}>
                {busy === "approve" ? "Approving..." : "Approve quote"}
              </button>
            </div>
          </section>
        )}

        {locked && (
          <section className={card} aria-label="Payment">
            <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Approved{quote.approval ? ` by ${quote.approval.name}` : ""}
            </p>

            {quote.gate.state === "ready" && (
              <>
                <p className="mt-2 text-body">
                  {p.deposit
                    ? `Pay the ${money(quote.gate.amountDue)} deposit now. The balance is due before pickup.`
                    : `Pay ${money(quote.gate.amountDue)} by card on our secure payment page.`}
                </p>
                <button className={`${button} mt-3`} disabled={busy !== ""} onClick={pay}>
                  {busy === "pay" ? "Opening payment..." : p.deposit ? `Pay deposit ${money(quote.gate.amountDue)}` : `Pay ${money(quote.gate.amountDue)}`}
                </button>
              </>
            )}

            {quote.gate.state === "paid" && (
              <p className="mt-2 text-body font-bold">
                Paid{quote.amountPaid ? ` ${money(quote.amountPaid)}` : ""} - thank you! We&apos;ll be in touch when it&apos;s ready.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
