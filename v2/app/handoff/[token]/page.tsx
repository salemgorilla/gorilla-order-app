"use client";

import { use, useState } from "react";
import { upload } from "@vercel/blob/client";

import { handoffPrefix, isValidHandoffToken } from "../../../lib/handoff";
import { formatBytes, MAX_BLOB_ARTWORK_BYTES } from "../../../lib/upload-limits";

/**
 * Order Desk — the page a customer's phone opens after scanning the kiosk.
 *
 * ONE job: send a file. No order details, no prices, no name, nothing about
 * anyone else's order — the token is a bearer capability that could in
 * principle be scanned off the screen by someone standing behind, so this page
 * shows nothing worth stealing.
 *
 * Written for a phone held one-handed by somebody standing at a counter with a
 * member of staff waiting: big target, one control, and a state after upload
 * that plainly says "you're done, look up".
 *
 * Uploads go STRAIGHT to blob storage from the phone. Not through a function —
 * a serverless request body caps at ~4.4 MB, which is smaller than most print
 * files and most modern phone photos.
 */
export default function HandoffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sentName, setSentName] = useState("");
  const [error, setError] = useState("");

  const validToken = isValidHandoffToken(token);

  async function send(file: File | undefined) {
    if (!file) return;

    setState("sending");
    setError("");

    try {
      await upload(`${handoffPrefix(token)}${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/artwork-upload",
      });

      setSentName(file.name);
      setState("sent");
    } catch (uploadError) {
      setState("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The upload didn't go through."
      );
    }
  }

  if (!validToken) {
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

  if (state === "sent") {
    return (
      <Shell>
        <div className="grid h-16 w-16 place-items-center bg-[var(--gorilla-green)] text-display text-[var(--paper)]">
          ✓
        </div>
        <h1 className="mt-6 text-hero font-bold tracking-display text-[var(--ink-black)]">
          Sent
        </h1>
        <p className="mt-2 text-lede text-[var(--ink-muted)]">
          <span className="spec">{sentName}</span> is on the shop&rsquo;s screen
          now. You can put your phone away.
        </p>

        {/* Somebody who sent the wrong photo needs a way back without
            rescanning, and it is the first thing they will look for. */}
        <label className="mt-8 inline-block min-h-[56px] cursor-pointer border border-[var(--rule)] px-6 py-4 text-body font-bold text-[var(--ink-black)]">
          Send a different file
          <input
            type="file"
            className="sr-only"
            onChange={(event) => send(event.target.files?.[0])}
          />
        </label>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="eyebrow">Gorilla Salem</p>
      <h1 className="mt-2 text-hero font-bold tracking-display text-[var(--ink-black)]">
        Send us your artwork
      </h1>
      <p className="mt-3 text-lede text-[var(--ink-muted)]">
        Pick the file or photo you want printed. It goes straight to the screen
        at the counter.
      </p>

      <label
        className={`mt-8 block min-h-[64px] cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 py-5 text-center text-value font-bold text-[var(--paper)] ${
          state === "sending" ? "opacity-60" : ""
        }`}
      >
        {state === "sending" ? "Sending…" : "Choose a file"}
        <input
          type="file"
          className="sr-only"
          disabled={state === "sending"}
          onChange={(event) => send(event.target.files?.[0])}
        />
      </label>

      {state === "error" && (
        <p
          role="alert"
          className="mt-4 bg-[var(--surface-warn)] p-4 text-fine font-bold leading-5 text-[var(--ink-warn)]"
        >
          {error} Try again, or hand your phone to the person serving you and
          we&rsquo;ll sort it out.
        </p>
      )}

      <p className="mt-6 text-fine text-[var(--ink-muted)]">
        Up to {formatBytes(MAX_BLOB_ARTWORK_BYTES)}. PNG, JPG, PDF, AI, EPS or
        SVG — if you&rsquo;re not sure, send what you have and we&rsquo;ll tell
        you whether it will print.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--shirt-blank)] px-5 py-12">
      <div className="mx-auto max-w-md">{children}</div>
    </main>
  );
}
