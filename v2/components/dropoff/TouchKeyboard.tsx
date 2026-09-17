"use client";

/**
 * The keyboard, because the hardware has not got one.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 * A Pi in a countertop enclosure running Chromium --kiosk has a touchscreen
 * and nothing else. Chromium does not bring an on-screen keyboard; that is
 * the OS's job, and on Raspberry Pi OS it means installing and wiring up
 * something like onboard, which then has to be kept working forever on a
 * machine nobody logs into.
 *
 * Every text field on this station would otherwise be unusable — including
 * the order number, which is not even numeric: GS-20260914-T6JBK has letters
 * in it, so the "numeric keypad" the brief asked for could not type a single
 * real order number.
 *
 * So the appliance brings its own keyboard and depends on no OS component.
 *
 * ── TWO LAYOUTS, ONE COMPONENT ────────────────────────────────────────────
 * "code" is what an order number is made of: A-Z, 0-9, upper case, no
 * punctuation — the dashes are inserted by normaliseQuoteNumber, so nobody
 * has to find a dash key while a member of staff waits.
 *
 * "email" is lower-case with the two keys that make an address bearable on a
 * touchscreen: @ and a .com. Lower case throughout because addresses are
 * matched case-insensitively and a shift key is one more thing to miss.
 */

type Layout = "code" | "email";

const ROWS: Record<Layout, string[][]> = {
  code: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ],
  email: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m", "-", "_"],
    ["@", ".", ".com", ".net", ".org"],
  ],
};

type Props = {
  layout: Layout;
  onKey: (value: string) => void;
  onBackspace: () => void;
  /** The green key. Disabled until the field holds something usable. */
  onEnter: () => void;
  enterLabel: string;
  enterEnabled: boolean;
};

export default function TouchKeyboard({
  layout,
  onKey,
  onBackspace,
  onEnter,
  enterLabel,
  enterEnabled,
}: Props) {
  return (
    // Height-aware, not width-aware: the constraint on this appliance is a
    // 600px-tall Pi screen, and the way out of the flow has to stay on it.
    <div className="mt-4 select-none space-y-2 [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:space-y-1">
      {ROWS[layout].map((row, index) => (
        <div key={index} className="flex justify-center gap-2">
          {row.map((key) => (
            <button
              key={key}
              type="button"
              // Every key is its own tap target at counter height. 56px is
              // above the 48px the brief asks for, because the person using
              // this is standing up, at arm's length, possibly holding a bag.
              // On a 600px-tall screen it drops to exactly 48 — the floor,
              // never under it, because the alternative is an exit button
              // the customer cannot reach.
              className="min-h-[56px] min-w-[56px] flex-1 border border-[var(--rule)] bg-[var(--shirt-blank)] px-2 text-lede font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear active:bg-[var(--ink-black)] active:text-[var(--paper)] [@media(max-height:700px)]:min-h-[48px] [@media(max-height:700px)]:min-w-[48px]"
              onClick={() => onKey(key)}
            >
              {key}
            </button>
          ))}
        </div>
      ))}

      <div className="flex justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={onBackspace}
          className="min-h-[56px] flex-1 border border-[var(--rule)] bg-[var(--shirt-blank)] px-4 text-lede font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear active:bg-[var(--ink-black)] active:text-[var(--paper)] [@media(max-height:700px)]:min-h-[48px]"
        >
          ← Delete
        </button>

        <button
          type="button"
          onClick={onEnter}
          disabled={!enterEnabled}
          className="min-h-[56px] flex-[2] border border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-4 text-lede font-bold text-white transition-colors duration-[120ms] ease-linear disabled:cursor-not-allowed disabled:border-[var(--rule)] disabled:bg-[var(--shirt-blank)] disabled:text-[var(--ink-muted)] [@media(max-height:700px)]:min-h-[48px]"
        >
          {enterLabel}
        </button>
      </div>
    </div>
  );
}
