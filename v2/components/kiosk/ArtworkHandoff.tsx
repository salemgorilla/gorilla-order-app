"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  createHandoffToken,
  type HandoffFile,
} from "../../lib/handoff";

type Props = {
  /** Called with the file once the phone has sent it. */
  onFileReceived: (file: File) => void;
};

/**
 * Order Desk — "send it from your phone".
 *
 * Shown beside the upload box on the kiosk, because the walk-in case is that
 * the artwork is on a phone and the kiosk cannot reach it.
 *
 * ── WHY POLLING, AND WHY IT STOPS ─────────────────────────────────────────
 * The phone uploads to blob storage; nothing pushes to the kiosk. Polling is
 * the honest mechanism, so the only questions are how often and for how long.
 * Every two seconds while the panel is open, and it gives up after the token
 * expires — a kiosk left on a quote overnight must not sit there polling until
 * someone reboots it.
 *
 * The panel is only ever opened deliberately. Generating a token on mount
 * would mint one for every customer who never looks at their phone.
 * ──────────────────────────────────────────────────────────────────────────
 */
export default function ArtworkHandoff({ onFileReceived }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState("");
  const [status, setStatus] = useState<
    "idle" | "waiting" | "fetching" | "done" | "off" | "error"
  >("idle");
  const [error, setError] = useState("");

  /** Pathnames already handed over, so one file is never delivered twice. */
  const claimed = useRef(new Set<string>());

  const start = useCallback(async () => {
    const fresh = createHandoffToken();
    const url = `${window.location.origin}/handoff/${fresh}`;

    // Rendered as SVG rather than a canvas image: it stays crisp at whatever
    // size the counter screen is, and a blurry QR is one a phone will not read.
    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });

    claimed.current = new Set();
    setQrSvg(svg);
    setToken(fresh);
    setStatus("waiting");
    setError("");
  }, []);

  useEffect(() => {
    if (!token || status !== "waiting") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/handoff?token=${encodeURIComponent(token)}`
        );

        if (response.status === 501) {
          if (!cancelled) setStatus("off");
          return;
        }

        const result = await response.json().catch(() => null);
        if (cancelled || !result?.ok) return;

        const pending = (result.files as HandoffFile[]).find(
          (file) => !claimed.current.has(file.pathname)
        );
        if (!pending) return;

        claimed.current.add(pending.pathname);
        if (!cancelled) setStatus("fetching");

        // Pulled back through the kiosk so the rest of the flow receives an
        // ordinary File and knows nothing about hand-offs — the preview, the
        // proof and the submit path all work unchanged.
        const blob = await fetch(pending.url).then((r) => r.blob());
        if (cancelled) return;

        onFileReceived(
          new File([blob], pending.filename, {
            type: blob.type || "application/octet-stream",
          })
        );
        setStatus("done");
      } catch {
        // A single failed poll is not worth showing anyone — the next one is
        // two seconds away. Only a configuration answer changes the state.
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2000);

    // Stop when the token dies, rather than polling forever on a machine that
    // nobody is standing at.
    const stop = window.setTimeout(() => {
      if (!cancelled) {
        setStatus("error");
        setError("That code expired. Start a new one when you're ready.");
      }
    }, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [token, status, onFileReceived]);

  return (
    <div className="mt-4 border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
      <p className="eyebrow">Artwork on your phone?</p>
      <h3 className="mt-2 text-lede font-bold text-[var(--ink-black)]">
        Send it across with your camera
      </h3>

      {status === "idle" && (
        <>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            We&rsquo;ll show a code. Point your phone camera at it, and send the
            file from there — nothing to install, nothing to log into.
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-4 min-h-[56px] cursor-pointer border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-6 text-base font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)]"
          >
            Show me the code
          </button>
        </>
      )}

      {(status === "waiting" || status === "fetching") && (
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div
            className="w-44 shrink-0 border border-[var(--rule)] bg-white p-3"
            // The library returns a complete, self-contained SVG document
            // built from the URL this component just generated. No user input
            // reaches it.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--ink-black)]">
              {status === "fetching"
                ? "Got it — bringing it across…"
                : "Waiting for your phone…"}
            </p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Open the camera app and hold it up to the code. Tap the link that
              appears.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-4 min-h-[44px] cursor-pointer border border-[var(--rule)] px-4 text-sm font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {status === "done" && (
        <p className="mt-3 bg-[var(--surface-ok)] p-3 text-sm font-bold text-[var(--gorilla-green-dark)]">
          ✓ Your file came through and is on this screen now.
        </p>
      )}

      {status === "off" && (
        // Says which thing is not set up, so a member of staff can report
        // something useful rather than "the QR thing is broken".
        <p className="mt-3 bg-[var(--surface-warn)] p-3 text-sm font-bold leading-5 text-[var(--ink-warn)]">
          Phone hand-off isn&rsquo;t switched on for this deployment (blob
          storage is not connected). Use the upload box above, or email the file
          in.
        </p>
      )}

      {status === "error" && (
        <div className="mt-3">
          <p className="bg-[var(--surface-warn)] p-3 text-sm font-bold text-[var(--ink-warn)]">
            {error}
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-3 min-h-[44px] cursor-pointer border border-[var(--rule)] px-4 text-sm font-bold text-[var(--ink-black)] hover:border-[var(--ink-black)]"
          >
            Show a new code
          </button>
        </div>
      )}
    </div>
  );
}
