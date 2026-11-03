"use client";

import { useCallback, useState } from "react";

type Row = {
  id: string;
  order: string;
  customer: string;
  status: string;
  createdAt: string;
  total?: number;
  paid?: number;
  printavo: { state: string; visualId?: string; error?: string } | null;
};

/** "M-12, L-10, 2XL-2" -> { M: 12, L: 10, "2XL": 2 }. Garbage is left for the server to refuse. */
function parseSizes(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(",")) {
    const match = part.trim().match(/^(.+?)\s*[-:x ]\s*(\d+)$/i);
    if (match) out[match[1].trim().toUpperCase()] = Number(match[2]);
  }
  return out;
}

/**
 * The shop's side of the customer quote link: build a quote (customer,
 * garment, print, starting sizes), copy its link, regenerate it, unlock an
 * approval, retry the Printavo hand-off after a paid order.
 *
 * A link's URL is shown ONCE, at creation or regeneration - only a hash of
 * the token is stored, so an old link cannot be re-copied, only replaced.
 */
export default function QuoteLinksAdmin() {
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [form, setForm] = useState({
    customerName: "", customerEmail: "", customerPhone: "",
    style: "3001", colorName: "Black", printLocations: "Front",
    inkColors: "1 color", hasUnderbase: true, sizes: "M-12, L-12",
    minimumPieces: "24", depositPercent: "", turnaroundNote: "Ready about 10 business days after payment.",
    method: "Screen print",
  });

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      });
      return res.json();
    },
    [secret]
  );

  const load = useCallback(async () => {
    if (!secret) return;
    const data = await call("/api/admin/quote-links");
    if (data.ok) setRows(data.links);
    else setMessage(data.error);
  }, [call, secret]);

  async function create() {
    setMessage(""); setUrl("");
    const data = await call("/api/admin/quote-links", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        sizes: parseSizes(form.sizes),
        printLocations: form.printLocations.split(",").map((s) => s.trim()).filter(Boolean),
        depositPercent: form.depositPercent === "" ? null : Number(form.depositPercent),
        minimumPieces: Number(form.minimumPieces),
      }),
    });
    if (data.ok) { setUrl(data.url); load(); } else setMessage(data.error);
  }

  async function act(id: string, action: string) {
    setMessage(""); setUrl("");
    const data = await call(`/api/admin/quote-links/${id}`, {
      method: "POST", body: JSON.stringify({ action }),
    });
    if (!data.ok) setMessage(data.error);
    else if (data.url) setUrl(data.url);
    load();
  }

  const input = "min-h-[44px] border border-[var(--ink-black)] bg-[var(--paper)] px-3 text-body";
  const btn = "min-h-[44px] cursor-pointer border-2 border-[var(--ink-black)] px-3 font-bold hover:bg-[var(--ink-black)] hover:text-white";
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-head font-bold tracking-display">Customer quote links</h1>

      <input className={input} type="password" placeholder="Admin secret" value={secret}
        onChange={(e) => setSecret(e.target.value)} />
      <button className={btn} onClick={load}>Load links</button>

      {message && <p role="alert" className="border border-[var(--rule)] bg-[var(--surface-rush)] p-3 font-bold">{message}</p>}
      {url && (
        <div className="border border-[var(--rule)] bg-[var(--surface-ok)] p-3">
          <p className="text-fine font-bold">Customer link (shown once):</p>
          <p className="spec break-all text-fine">{url}</p>
          <button className={`${btn} mt-2`} onClick={() => navigator.clipboard?.writeText(url)}>Copy</button>
        </div>
      )}

      <section className="flex flex-col gap-3 border border-[var(--rule)] bg-[var(--paper)] p-4">
        <h2 className="text-value font-bold">New quote</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Customer name" value={form.customerName} onChange={set("customerName")} />
          <input className={input} placeholder="Customer email" value={form.customerEmail} onChange={set("customerEmail")} />
          <input className={input} placeholder="Phone (optional)" value={form.customerPhone} onChange={set("customerPhone")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={input} placeholder="S&S style (3001)" value={form.style} onChange={set("style")} />
          <input className={input} placeholder="Colour (Black)" value={form.colorName} onChange={set("colorName")} />
          <input className={input} placeholder="Print locations, comma separated" value={form.printLocations} onChange={set("printLocations")} />
          <select className={input} value={form.inkColors} onChange={set("inkColors")}>
            {["1 color", "2 colors", "3 colors", "4 colors", "5+ colors"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className={input} placeholder="Starting sizes: M-12, L-12" value={form.sizes} onChange={set("sizes")} />
          <input className={input} placeholder="Minimum pieces" value={form.minimumPieces} onChange={set("minimumPieces")} />
          <input className={input} placeholder="Deposit % (blank = automatic)" value={form.depositPercent} onChange={set("depositPercent")} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.hasUnderbase}
            onChange={(e) => setForm({ ...form, hasUnderbase: e.target.checked })} />
          White underbase (dark garment)
        </label>
        <input className={input} placeholder="Turnaround note shown to the customer" value={form.turnaroundNote} onChange={set("turnaroundNote")} />
        <p className="text-fine text-[var(--ink-muted)]">
          Priced by the website engine plus a 3% card fee. Over $4,999.99 the customer pays a 50% deposit unless you set one.
        </p>
        <button className={btn} onClick={create}>Create link</button>
      </section>

      <section className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-[var(--rule)] bg-[var(--paper)] p-3">
            <div>
              <p className="font-bold">{r.order} - {r.customer}</p>
              <p className="spec text-fine text-[var(--ink-muted)]">
                {r.status}
                {r.total ? ` - total $${r.total.toFixed(2)}` : ""}
                {r.paid ? ` - paid $${r.paid.toFixed(2)}` : ""}
                {r.printavo ? ` - Printavo ${r.printavo.state}${r.printavo.visualId ? ` #${r.printavo.visualId}` : ""}` : ""}
              </p>
              {r.printavo?.error && <p className="text-fine font-bold text-[var(--rush-red-dark)]">{r.printavo.error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => act(r.id, "regenerate")}>New link</button>
              {(r.status === "approved" || r.status === "payment_started") && (
                <button className={btn} onClick={() => act(r.id, "unlock")}>Unlock</button>
              )}
              {r.status === "paid" && r.printavo?.state !== "created" && (
                <button className={btn} onClick={() => act(r.id, "retry-printavo")}>Retry Printavo</button>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
