"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { uploadPresigned } from "@vercel/blob/client";

import {
  DROPOFF_IDLE_MS,
  DROPOFF_WARNING_MS,
  dropoffPrefix,
  isQuoteNumberShape,
  normaliseQuoteNumber,
  type DropoffFile,
} from "../../lib/dropoff";
import { looksLikeEmailAddress } from "../../lib/email-address";
import TouchKeyboard from "./TouchKeyboard";

/**
 * THE DROP-OFF STATION — the whole appliance, in one component.
 *
 * ── HOW A SESSION ENDS ────────────────────────────────────────────────────
 * By discarding every piece of state at once, on a timer, from any screen
 * past the first. The thing being protected is the next person in the queue
 * walking up to a stranger's order number and their files on screen.
 *
 * The order desk (components/kiosk) makes that guarantee structurally, by
 * remounting a keyed subtree — it has to, because it holds twenty-odd pieces
 * of state and object URLs. This holds five, all in one reducer-shaped
 * object, so `setSession(FRESH)` is the whole reset and there is nothing to
 * forget. If this ever grows a sixth, it should move to the remount.
 *
 * ── WHY THE SCREEN POLLS ──────────────────────────────────────────────────
 * The customer's phone uploads to blob storage; nothing pushes to the
 * counter. Polling is the honest mechanism. Every two seconds while a
 * session is open, and it stops the moment the session ends — a station left
 * on overnight must not still be polling in the morning.
 */

type Phase = "idle" | "number" | "email" | "checking" | "ready" | "done";

type Session = {
  phase: Phase;
  numberDraft: string;
  emailDraft: string;
  token: string;
  quoteNumber: string;
  status: string;
  error: string;
};

const FRESH: Session = {
  phase: "idle",
  numberDraft: "",
  emailDraft: "",
  token: "",
  quoteNumber: "",
  status: "",
  error: "",
};

export default function DropoffStation() {
  const [session, setSession] = useState<Session>(FRESH);
  const [files, setFiles] = useState<DropoffFile[]>([]);
  const [qrSvg, setQrSvg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [warning, setWarning] = useState<number | null>(null);

  const reset = useCallback(() => {
    setSession(FRESH);
    setFiles([]);
    setQrSvg("");
    setUploading(false);
    setUploadError("");
    setWarning(null);
  }, []);

  /**
   * The idle clock.
   *
   * Runs on every screen except the first — on the first there is nothing to
   * protect and nothing to reset to. It warns before it acts, and any touch
   * anywhere cancels it: somebody reading the screen, or digging through a
   * phone for a file, is using the machine even though they are not touching
   * it, and silently wiping their session would send them back to the start.
   */
  const deadline = useRef(0);

  useEffect(() => {
    if (session.phase === "idle") return;

    deadline.current = Date.now() + DROPOFF_IDLE_MS;

    const touched = () => {
      deadline.current = Date.now() + DROPOFF_IDLE_MS;
      setWarning(null);
    };

    const events = ["pointerdown", "keydown", "touchstart", "input"] as const;
    for (const event of events) {
      window.addEventListener(event, touched, { passive: true });
    }

    const tick = window.setInterval(() => {
      const left = deadline.current - Date.now();

      if (left <= 0) reset();
      else if (left <= DROPOFF_WARNING_MS) setWarning(Math.ceil(left / 1000));
    }, 500);

    return () => {
      for (const event of events) window.removeEventListener(event, touched);
      window.clearInterval(tick);
    };
  }, [session.phase, reset]);

  /** Poll for anything the phone has sent. Stops with the session. */
  useEffect(() => {
    if (session.phase !== "ready" || !session.token) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/dropoff/files?token=${encodeURIComponent(session.token)}`
        );
        const data = await response.json();

        if (!cancelled && data?.ok && Array.isArray(data.files)) {
          setFiles(data.files as DropoffFile[]);
        }
      } catch {
        // A failed poll is a poll. The next one is two seconds away, and
        // showing an error for a blip would train the shop to ignore the
        // one that matters.
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session.phase, session.token]);

  /** The QR code, drawn once per session. */
  useEffect(() => {
    if (session.phase !== "ready" || !session.token) return;

    const url = `${window.location.origin}/dropoff/send/${session.token}`;

    // SVG rather than a canvas image: it stays crisp at whatever size the
    // counter screen is, and a blurry QR is one a phone will not read.
    void QRCode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    }).then(setQrSvg);
  }, [session.phase, session.token]);

  const quoteNumber = normaliseQuoteNumber(session.numberDraft);

  async function lookUp() {
    setSession((s) => ({ ...s, phase: "checking", error: "" }));

    try {
      const response = await fetch("/api/dropoff/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteNumber, email: session.emailDraft }),
      });
      const data = await response.json();

      if (data?.ok && data.token) {
        setSession((s) => ({
          ...s,
          phase: "ready",
          token: String(data.token),
          quoteNumber: String(data.quoteNumber),
          status: String(data.status || ""),
        }));
        return;
      }

      // Each refusal says the one useful thing and nothing about the others.
      // "No match" never distinguishes a wrong number from a wrong address —
      // see the route.
      const message =
        data?.reason === "rate-limited"
          ? data.message
          : data?.reason === "not-configured"
          ? data.message
          : data?.reason === "unavailable"
          ? "We can't reach our order system right now. Please hand your file to the counter."
          : "We couldn't find that. Check the order number and the email on your confirmation, or ask at the counter.";

      setSession((s) => ({ ...s, phase: "email", error: message }));
    } catch {
      setSession((s) => ({
        ...s,
        phase: "email",
        error: "Something went wrong. Please hand your file to the counter.",
      }));
    }
  }

  /** The USB path: whatever the OS picker returns, straight to blob storage. */
  async function sendFromDrive(picked: FileList | null) {
    if (!picked || picked.length === 0 || !session.token) return;

    setUploading(true);
    setUploadError("");

    try {
      for (const file of Array.from(picked)) {
        await uploadPresigned(`${dropoffPrefix(session.token)}${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/artwork-upload",
        });
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "That file didn't go through."
      );
    } finally {
      setUploading(false);
    }
  }

  async function finish() {
    try {
      await fetch("/api/dropoff/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.token }),
      });
    } catch {
      // The files are already in the shop's store; the email is a courtesy on
      // top of that. Failing it must not leave the customer staring at a
      // spinner, so the screen thanks them either way and the shop still has
      // the files under the order's prefix.
    }

    setSession((s) => ({ ...s, phase: "done" }));
    window.setTimeout(reset, 6000);
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--paper)] p-6 [@media(max-height:700px)]:p-4">
      {warning !== null && session.phase !== "done" && (
        <div
          role="status"
          className="mb-6 border-2 border-[var(--rush-red)] bg-[var(--surface-rush)] p-4 text-center text-lede font-bold text-[var(--rush-red)]"
        >
          Still there? Clearing this screen in {warning}s — touch anywhere to stay.
        </div>
      )}

      {session.phase === "idle" && (
        <Centered>
          <p className="eyebrow">Gorilla Salem</p>
          <h1 className="mt-3 text-display font-bold leading-none tracking-display text-[var(--ink-black)]">
            Drop off
            <br />
            your artwork
          </h1>
          <p className="mt-6 max-w-xl text-lede text-[var(--ink-muted)]">
            Already ordered? Send us your print file from a USB stick or straight
            from your phone. Have your order number ready.
          </p>

          <button
            type="button"
            onClick={() => setSession({ ...FRESH, phase: "number" })}
            className="mt-10 min-h-[80px] w-full max-w-xl border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-10 text-hero font-bold text-white transition-colors duration-[120ms] ease-linear active:bg-[var(--ink-black)]"
          >
            Start
          </button>

          <p className="mt-8 text-fine text-[var(--ink-muted)]">
            Haven&rsquo;t ordered yet? Please see someone at the counter.
          </p>
        </Centered>
      )}

      {session.phase === "number" && (
        <Centered>
          <Step n={1} of={2} label="Order number" />
          <p className="mt-2 text-lede text-[var(--ink-muted)]">
            It&rsquo;s on your confirmation email — it looks like GS-20260914-T6JBK.
          </p>

          {/* The NORMALISED number, not the keystrokes. The pad has no dash
              key, so somebody typing GS20260914T6JBK needs to see the app
              turn it into their order number before they press Next —
              otherwise the screen disagrees with the receipt in their hand
              and the natural response is to start deleting. */}
          <Field value={quoteNumber || " "} nowrap />


          <TouchKeyboard
            layout="code"
            onKey={(key) =>
              setSession((s) => ({
                ...s,
                // Capped so a leaned-on screen cannot build a megabyte string.
                numberDraft: (s.numberDraft + key).slice(0, 24),
              }))
            }
            onBackspace={() =>
              setSession((s) => ({ ...s, numberDraft: s.numberDraft.slice(0, -1) }))
            }
            onEnter={() => setSession((s) => ({ ...s, phase: "email", error: "" }))}
            enterLabel="Next"
            enterEnabled={isQuoteNumberShape(quoteNumber)}
          />

          <Cancel onClick={reset} />
        </Centered>
      )}

      {(session.phase === "email" || session.phase === "checking") && (
        <Centered>
          <Step n={2} of={2} label="Your email" />
          <p className="mt-2 text-lede text-[var(--ink-muted)]">
            So we know the order is yours. Nothing is sent to it.
          </p>

          <Field value={session.emailDraft || " "} />

          {session.error && (
            <p
              role="alert"
              className="mt-4 border-2 border-[var(--rush-red)] bg-[var(--surface-rush)] p-4 text-fine font-bold text-[var(--rush-red)]"
            >
              {session.error}
            </p>
          )}

          {session.phase === "checking" ? (
            <p className="spec mt-8 text-lede text-[var(--ink-muted)]">CHECKING…</p>
          ) : (
            <TouchKeyboard
              layout="email"
              onKey={(key) =>
                setSession((s) => ({
                  ...s,
                  emailDraft: (s.emailDraft + key).slice(0, 120),
                }))
              }
              onBackspace={() =>
                setSession((s) => ({ ...s, emailDraft: s.emailDraft.slice(0, -1) }))
              }
              onEnter={() => void lookUp()}
              enterLabel="Find my order"
              enterEnabled={looksLikeEmailAddress(session.emailDraft)}
            />
          )}

          <Cancel onClick={reset} />
        </Centered>
      )}

      {session.phase === "ready" && (
        <div className="mx-auto w-full max-w-5xl">
          <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
            <p className="eyebrow">Sending to</p>
            <p className="spec mt-1 text-hero font-bold text-[var(--ink-black)]">
              {session.quoteNumber}
            </p>
            {session.status && (
              <p className="mt-1 text-fine text-[var(--ink-muted)]">
                Currently: {session.status}
              </p>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="From a USB stick">
              <p className="text-fine text-[var(--ink-muted)]">
                Put your stick in the slot under the screen, then choose your
                file.
              </p>

              <label className="mt-4 block">
                <span className="sr-only">Choose artwork from a drive</span>
                <input
                  type="file"
                  multiple
                  disabled={uploading}
                  onChange={(event) => void sendFromDrive(event.target.files)}
                  className="block w-full text-fine file:mr-4 file:min-h-[56px] file:border-0 file:bg-[var(--gorilla-green)] file:px-6 file:text-lede file:font-bold file:text-white"
                />
              </label>

              {uploading && (
                <p className="spec mt-3 text-fine text-[var(--ink-muted)]">SENDING…</p>
              )}
              {uploadError && (
                <p role="alert" className="mt-3 text-fine font-bold text-[var(--rush-red)]">
                  {uploadError}
                </p>
              )}
            </Panel>

            <Panel title="From your phone">
              <p className="text-fine text-[var(--ink-muted)]">
                Scan this with your camera. Files land here the moment you send
                them — you don&rsquo;t need to touch this screen again.
              </p>

              {qrSvg ? (
                <div
                  className="mt-4 mx-auto h-56 w-56 bg-white p-2"
                  // The SVG is generated in this component by the qrcode
                  // library from a URL we built — no user input reaches it.
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <p className="spec mt-4 text-fine text-[var(--ink-muted)]">
                  DRAWING CODE…
                </p>
              )}
            </Panel>
          </div>

          <div className="mt-6 border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
            <p className="eyebrow">
              Received ({files.length})
            </p>

            {files.length === 0 ? (
              <p className="mt-2 text-fine text-[var(--ink-muted)]">
                Nothing yet. Send a file from either side above.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {files.map((file) => (
                  <li
                    key={file.pathname}
                    className="flex items-center justify-between gap-4 border-b border-[var(--rule-faint)] pb-2"
                  >
                    <span className="spec text-fine text-[var(--ink-black)]">
                      {file.filename}
                    </span>
                    <span className="spec text-fine text-[var(--gorilla-green)]">
                      ✓ {Math.round(file.size / 1024)} KB
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => void finish()}
            disabled={files.length === 0}
            // Hero size is for the thing you press. While there is nothing to
            // press for, the same element is a status line and reads at status
            // size — a disabled button shouting "Waiting for your file" across
            // the counter is the loudest thing on screen saying nothing.
            className={`mt-6 min-h-[80px] w-full border-2 px-10 font-bold transition-colors duration-[120ms] ease-linear ${
              files.length === 0
                ? "cursor-not-allowed border-[var(--rule)] bg-[var(--shirt-blank)] text-lede text-[var(--ink-muted)]"
                : "border-[var(--gorilla-green)] bg-[var(--gorilla-green)] text-hero text-white active:bg-[var(--ink-black)]"
            }`}
          >
            {files.length === 0 ? "Waiting for your file…" : "Done"}
          </button>

          <Cancel onClick={reset} />
        </div>
      )}

      {session.phase === "done" && (
        <Centered>
          <div className="grid h-24 w-24 place-items-center bg-[var(--gorilla-green)] text-display text-[var(--paper)]">
            ✓
          </div>
          <h1 className="mt-8 text-display font-bold leading-none tracking-display text-[var(--ink-black)]">
            Got it
          </h1>
          <p className="mt-4 text-lede text-[var(--ink-muted)]">
            Your artwork is with Gorilla Salem. We&rsquo;ll be in touch if
            anything needs checking.
          </p>
        </Centered>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-2">
      {children}
    </div>
  );
}

/**
 * The heading on an entry screen.
 *
 * Deliberately smaller than the idle screen's, and the labels are kept to two
 * words: the Pi screens this runs on are as short as 600px, and at display
 * size a heading that wrapped to two lines pushed "Start over" off the bottom
 * of a panel with no address bar, no back gesture and no scrollbar a customer
 * would think to use. The way out has to be on screen at every size.
 */
function Step({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <>
      <p className="eyebrow">
        Step {n} of {of}
      </p>
      <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-display text-[var(--ink-black)] [@media(max-height:700px)]:text-[1.5rem]">
        {label}
      </h1>
    </>
  );
}

/**
 * What has been typed, big enough to read standing up.
 *
 * Sized in rem rather than at the display scale: a full order number is
 * seventeen mono characters, and at hero size it wrapped onto a second line
 * mid-number — which reads as an error on the one screen whose entire job is
 * confirming the customer typed the right thing. An email address still
 * wraps, because some of them genuinely are that long.
 */
function Field({ value, nowrap = false }: { value: string; nowrap?: boolean }) {
  return (
    <div
      className={`spec mt-4 min-h-[72px] w-full border-2 border-[var(--ink-black)] bg-white p-4 text-[2.25rem] font-bold leading-tight text-[var(--ink-black)] [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:min-h-[56px] [@media(max-height:700px)]:p-2 [@media(max-height:700px)]:text-[1.75rem] ${
        nowrap ? "overflow-x-auto whitespace-nowrap" : "break-all"
      }`}
    >
      {value}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
      <h2 className="text-lede font-bold text-[var(--ink-black)]">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * The way out of every screen past the first.
 *
 * No back button anywhere: back implies a stack, and a half-remembered
 * position in a stack is exactly the state the next customer must not
 * inherit. There is one exit and it wipes everything.
 */
function Cancel({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-4 min-h-[56px] px-6 text-lede font-bold text-[var(--ink-muted)] underline underline-offset-4 transition-colors duration-[120ms] ease-linear active:text-[var(--ink-black)]"
    >
      Start over
    </button>
  );
}
