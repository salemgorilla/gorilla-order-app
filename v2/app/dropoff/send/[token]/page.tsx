"use client";

import { use, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";

import { dropoffPrefix, isDropoffTokenShape } from "../../../../lib/dropoff";
import { formatBytes, MAX_BLOB_ARTWORK_BYTES } from "../../../../lib/upload-limits";

/**
 * The page a customer's phone opens after scanning the drop-off screen.
 *
 * ── HOW THIS DIFFERS FROM /handoff/[token] ────────────────────────────────
 * That one shows nothing about anything, because it is minted mid-quote and
 * names no order — there is nothing to show. This one names the order, and
 * should: the customer is dropping off for a specific job, may have two open
 * with the shop, and the failure it prevents is sending the right file to the
 * wrong order.
 *
 * The order number is all it shows. Not the status, not a name, not a price.
 * A QR code on a counter screen can be photographed from behind, so what this
 * page reveals has to be worth nothing to a stranger — and an order number
 * alone is already printed on the customer's own receipt.
 *
 * Uploads go STRAIGHT to blob storage. Not through a function: a serverless
 * request body caps at ~4.4 MB, under the size of most print files.
 */
export default function DropoffSendPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [sent, setSent] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  // Shape only. Whether the signature is good is the server's answer, and it
  // is given when the counter screen asks what arrived — a phone that uploads
  // into a prefix nobody is watching has achieved nothing.
  const usable = isDropoffTokenShape(token);

  async function send(files: FileList | null) {
    if (!files || files.length === 0) return;

    setState("sending");
    setError("");

    try {
      for (const file of Array.from(files)) {
        await uploadPresigned(`${dropoffPrefix(token)}${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/artwork-upload",
        });

        setSent((previous) => [...previous, file.name]);
      }

      setState("idle");
    } catch (uploadError) {
      setState("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The upload didn't go through."
      );
    }
  }

  if (!usable) {
    return (
      <Shell>
        <h1 className="text-lede font-bold text-[var(--ink-black)]">
          This link isn&rsquo;t valid
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Scan the code on the shop&rsquo;s screen again — the codes only last a
          few minutes.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="eyebrow">Gorilla Salem</p>
      <h1 className="mt-2 text-hero font-bold tracking-display text-[var(--ink-black)]">
        Send your artwork
      </h1>
      <p className="mt-2 text-lede text-[var(--ink-muted)]">
        It goes straight to the screen in the shop.
      </p>

      {sent.length > 0 && (
        <div className="mt-6 border border-[var(--gorilla-green)] bg-[var(--surface-ok)] p-4">
          <p className="text-fine font-bold text-[var(--gorilla-green)]">
            {sent.length} file{sent.length === 1 ? "" : "s"} sent — look up at
            the shop&rsquo;s screen.
          </p>
          <ul className="mt-2 space-y-1">
            {sent.map((name) => (
              <li key={name} className="spec text-fine text-[var(--ink-muted)]">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="mt-6 block">
        <span className="sr-only">Choose artwork to send</span>
        <input
          type="file"
          multiple
          disabled={state === "sending"}
          onChange={(event) => void send(event.target.files)}
          className="block w-full text-fine file:mr-4 file:min-h-[56px] file:border-0 file:bg-[var(--gorilla-green)] file:px-6 file:text-lede file:font-bold file:text-white"
        />
      </label>

      <p className="mt-3 text-fine text-[var(--ink-muted)]">
        {state === "sending"
          ? "Sending…"
          : `Up to ${formatBytes(MAX_BLOB_ARTWORK_BYTES)} each. You can send more than one.`}
      </p>

      {state === "error" && (
        <p role="alert" className="mt-3 text-fine font-bold text-[var(--rush-red)]">
          {error} Try again, or hand your phone to the counter.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-[var(--paper)] p-6">
      {children}
    </main>
  );
}
