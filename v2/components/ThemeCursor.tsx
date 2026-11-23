"use client";

/**
 * The holiday cursor: while a holiday that names one is on (decor.cursor in
 * lib/theme-calendar.ts), a little animated character follows the mouse,
 * and a click on open page gets a small reaction (Santa's "Ho ho ho!", a
 * turkey's gobble, Cupid's heart…).
 *
 * Gabe, 2026-11-23: "I want it to be usable still too though, so it can't
 * interrupt when they're trying to pick certain things on the site." So:
 *
 * - The character is drawn on a layer that takes no clicks at all
 *   (pointer-events: none), and the mouse tip is the drawing's tip, so a
 *   click lands exactly where the customer aims.
 * - Over anything that has its own pointer (buttons, links, swatches,
 *   fields, the upload spot, anything with cursor-pointer), the character
 *   steps aside and the normal pointer shows.
 * - Mouse only. Phones, tablets and pens keep their normal touch; a touch
 *   on a laptop's screen puts the normal arrow back until the mouse moves.
 * - It only listens (passive listeners, nothing cancelled), moves by
 *   transform once per frame, and a click reaction never waits on anything.
 * - Visitors who ask for less motion get a still character, the bubble
 *   without the burst.
 * - Sounds play only on a click, short and quiet, and never if the browser
 *   won't allow them.
 */

import { useEffect, useRef } from "react";
import type { CursorSpec } from "../lib/theme-cursors";

/** Anything that keeps its own pointer: the character steps aside. */
export const CONTROL_SELECTOR =
  'a,button,input,select,textarea,label,summary,option,[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="tab"],[contenteditable],[tabindex]';

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const LESS_MOTION = "(prefers-reduced-motion: reduce)";
/** At most one reaction this often, however fast the clicks come. */
const REACTION_GAP_MS = 700;

export function ThemeCursor({ cursors }: { cursors: Readonly<Record<string, string>> }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const cursorId = cursors[root.dataset.theme ?? ""];
    const host = layer.current;
    if (!cursorId || !host) return;
    if (!window.matchMedia?.(FINE_POINTER).matches) return;

    let stopped = false;
    let teardown = () => {};

    Promise.all([import("../lib/theme-cursors"), import("../lib/theme-decor")]).then(([{ CURSORS }, decor]) => {
      decorUrlFn = decor.decorUrl;
      const spec = CURSORS[cursorId];
      if (stopped || !spec) return;
      teardown = follow(host, spec);
    });

    return () => {
      stopped = true;
      teardown();
    };
  }, [cursors]);

  return <div ref={layer} className="theme-cursor" aria-hidden="true" />;
}

/** Start following the mouse; returns how to stop. */
function follow(host: HTMLElement, spec: CursorSpec): () => void {
  const root = document.documentElement;
  const lessMotion = window.matchMedia(LESS_MOTION);
  const [hx, hy] = spec.hotspot;

  const sprite = document.createElement("div");
  sprite.className = "theme-cursor-follow";
  sprite.dataset.hidden = "";
  const art = document.createElement("div");
  art.className = "theme-cursor-art";
  art.style.width = `${spec.width}px`;
  art.style.height = `${spec.height}px`;
  art.innerHTML = spec.art; // our own drawing from lib/theme-cursors.ts
  sprite.append(art);
  host.append(sprite);

  let x = -100;
  let y = -100;
  let frame = 0;
  let overControl = true;
  let lastTarget: EventTarget | null = null;
  let lastReaction = 0;

  const show = (on: boolean) => {
    if (on) {
      delete sprite.dataset.hidden;
      root.dataset.themeCursor = "";
    } else {
      sprite.dataset.hidden = "";
    }
  };
  const draw = () => {
    frame = 0;
    sprite.style.transform = `translate3d(${x - hx}px, ${y - hy}px, 0)`;
  };

  /** Does this spot have its own pointer? */
  const isControl = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return true;
    if (target.closest(CONTROL_SELECTOR)) return true;
    // Anything else styled with its own cursor (cursor-pointer, a grab
    // handle, not-allowed…) keeps it.
    const own = getComputedStyle(target).cursor;
    return own !== "none" && own !== "auto" && own !== "default";
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") {
      // A finger or pen: hand back the normal pointer until the mouse returns.
      delete root.dataset.themeCursor;
      show(false);
      return;
    }
    x = e.clientX;
    y = e.clientY;
    if (e.target !== lastTarget) {
      lastTarget = e.target;
      overControl = isControl(e.target);
    }
    show(!overControl);
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const onLeave = () => show(false);

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || overControl) return;
    const now = performance.now();
    if (now - lastReaction < REACTION_GAP_MS) return;
    lastReaction = now;
    // After this frame, so the click itself is never held up.
    requestAnimationFrame(() => react(host, art, spec, e.clientX, e.clientY, lessMotion.matches));
  };

  const opts: AddEventListenerOptions = { passive: true, capture: true };
  window.addEventListener("pointermove", onMove, opts);
  window.addEventListener("pointerdown", onDown, opts);
  document.addEventListener("pointerleave", onLeave, opts);
  window.addEventListener("blur", onLeave, opts);

  return () => {
    window.removeEventListener("pointermove", onMove, opts);
    window.removeEventListener("pointerdown", onDown, opts);
    document.removeEventListener("pointerleave", onLeave, opts);
    window.removeEventListener("blur", onLeave, opts);
    if (frame) cancelAnimationFrame(frame);
    delete root.dataset.themeCursor;
    host.replaceChildren();
  };
}

/** A click on open page: bubble, burst, a little move, a sound. */
function react(host: HTMLElement, art: HTMLElement, spec: CursorSpec, x: number, y: number, still: boolean) {
  const { click } = spec;
  const later: HTMLElement[] = [];

  if (click.text) {
    const bubble = document.createElement("div");
    bubble.className = "theme-cursor-bubble";
    bubble.textContent = click.text;
    // Above and to the right of the character, kept on screen.
    const bx = Math.min(Math.max(x + spec.width - spec.hotspot[0] - 8, 4), window.innerWidth - 180);
    const by = Math.max(y - spec.hotspot[1] - 30, 4);
    bubble.style.setProperty("--x", `${bx}px`);
    bubble.style.setProperty("--y", `${by}px`);
    if (still) {
      bubble.style.animation = "none";
      bubble.style.opacity = "1";
      bubble.style.transform = `translate3d(${bx}px, ${by}px, 0)`;
    }
    host.append(bubble);
    later.push(bubble);
  }

  if (click.burst && !still) {
    const { shapes, count, mode } = click.burst;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("span");
      bit.className = "theme-cursor-bit";
      bit.dataset.mode = mode;
      bit.style.backgroundImage = decorBackground(shapes[i % shapes.length]);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const reach = 34 + Math.random() * 18;
      bit.style.setProperty("--x", `${x - 8}px`);
      bit.style.setProperty("--y", `${y - 8}px`);
      bit.style.setProperty("--dx", `${Math.cos(angle) * reach}px`);
      bit.style.setProperty("--dy", `${Math.sin(angle) * reach}px`);
      bit.style.setProperty("--rot", `${Math.round(Math.random() * 240 - 120)}deg`);
      host.append(bit);
      later.push(bit);
    }
  }

  if (click.move && !still) {
    art.dataset.move = click.move;
    window.setTimeout(() => delete art.dataset.move, 600);
  }

  if (click.say) speak(click.say);
  else if (click.sound) beep(click.sound);

  window.setTimeout(() => later.forEach((el) => el.remove()), 1300);
}

/* The burst shapes are the theme decor drawings (lib/theme-decor.ts),
   loaded with the cursor so the page doesn't carry them. */
let decorUrlFn: ((name: string) => string) | null = null;
function decorBackground(name: string): string {
  try {
    return decorUrlFn ? decorUrlFn(name) : "none";
  } catch {
    return "none";
  }
}

/** Santa's voice: the browser's own, low, slow and quiet. */
function speak(say: NonNullable<CursorSpec["click"]["say"]>) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || synth.speaking) return;
    const line = new SpeechSynthesisUtterance(say.text);
    line.pitch = say.pitch;
    line.rate = say.rate;
    line.volume = 0.5;
    synth.speak(line);
  } catch {
    /* no voice: the bubble says it */
  }
}

let audio: AudioContext | null = null;
/** A short, quiet sound made on the spot (no audio files). */
function beep(kind: NonNullable<CursorSpec["click"]["sound"]>) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const t = audio.currentTime;
    const notes: [number, number, number][] =
      kind === "pop"
        ? [[520, 0, 0.08]]
        : kind === "twang"
          ? [[330, 0, 0.18]]
          : [
              [880, 0, 0.12],
              [1320, 0.08, 0.16],
            ];
    for (const [freq, at, len] of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === "twang" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t + at);
      if (kind === "twang") osc.frequency.exponentialRampToValueAtTime(180, t + at + len);
      gain.gain.setValueAtTime(0.06, t + at);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + at);
      osc.stop(t + at + len + 0.02);
    }
  } catch {
    /* no sound: the burst shows it */
  }
}
