/**
 * THE BROWSER HALF OF lib/order-usage.ts.
 *
 * Collects, in memory, what this one page visit picked and how far it got,
 * and posts it to /api/usage when the tab is hidden or closed and right
 * after a quote is sent. Nothing is stored in the browser: no cookie, no
 * localStorage, no id. Close the tab and it is gone.
 *
 * Each step and each pick is sent ONCE per visit, however many times the
 * customer goes back and forth, so a count in the weekly report means "this
 * many visits", not "this many clicks".
 *
 * Like lib/analytics.ts: never throws, never awaits. Counting must never
 * get in the way of somebody finishing a quote.
 */

import type { FunnelStep, UsageFlow, UsagePick } from "./order-usage";

type Pending = { steps: Set<FunnelStep>; picks: Map<string, UsagePick> };

const pending = new Map<UsageFlow, Pending>();
const sent = new Set<string>();
let suppressed = false;
let listening = false;

/**
 * The shop's scheduled health check places a real test quote under a fixed
 * identity (PRODUCTION-HEALTH-CHECK-HANDOFF.md §3). Its visits are not
 * customers and must not steer the colour order, so once the contact step
 * shows that identity, this visit is dropped entirely.
 */
export const TEST_IDENTITY_EMAIL = "scheduled-test@gorillasalem.com";

export function isTestIdentity(email: unknown, name?: unknown): boolean {
  const address = String(email ?? "").trim().toLowerCase();
  const label = String(name ?? "").toUpperCase();
  return address === TEST_IDENTITY_EMAIL || label.includes("DO NOT FULFILL");
}

function queueFor(flow: UsageFlow): Pending {
  let queue = pending.get(flow);
  if (!queue) {
    queue = { steps: new Set(), picks: new Map() };
    pending.set(flow, queue);
  }
  return queue;
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const flushIfHidden = () => {
    if (document.visibilityState === "hidden") flushUsage();
  };
  document.addEventListener("visibilitychange", flushIfHidden);
  window.addEventListener("pagehide", () => flushUsage());
}

export function recordUsageStep(flow: UsageFlow, step: FunnelStep): void {
  try {
    if (suppressed) return;
    const key = `${flow}:step:${step}`;
    if (sent.has(key)) return;
    queueFor(flow).steps.add(step);
    listen();
  } catch {
    // See the header.
  }
}

export function recordUsagePick(flow: UsageFlow, pick: UsagePick): void {
  try {
    if (suppressed) return;
    const key = `${flow}:pick:${JSON.stringify(pick)}`;
    if (sent.has(key)) return;
    queueFor(flow).picks.set(key, pick);
    listen();
  } catch {
    // See the header.
  }
}

/** The health check's own visit: forget it, and send nothing more. */
export function suppressUsage(): void {
  suppressed = true;
  pending.clear();
}

/**
 * Post what is pending. sendBeacon first, because it survives the tab
 * closing; a keepalive fetch where sendBeacon is missing or refuses.
 */
export function flushUsage(): void {
  try {
    if (suppressed || typeof window === "undefined" || pending.size === 0) return;

    const beacons = [...pending.entries()]
      .map(([flow, queue]) => ({
        flow,
        steps: [...queue.steps],
        picks: [...queue.picks.values()],
      }))
      .filter((beacon) => beacon.steps.length > 0 || beacon.picks.length > 0);

    for (const [flow, queue] of pending) {
      for (const step of queue.steps) sent.add(`${flow}:step:${step}`);
      for (const key of queue.picks.keys()) sent.add(key);
    }
    pending.clear();

    if (beacons.length === 0) return;

    const body = JSON.stringify({ beacons });
    const blob = new Blob([body], { type: "application/json" });

    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/usage", blob)) {
      return;
    }

    void fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // See the header.
  }
}

/** Tests only. */
export function resetUsageBeacon(): void {
  pending.clear();
  sent.clear();
  suppressed = false;
}

/** Tests only: what would be posted, without posting it. */
export function pendingUsageForTest() {
  return [...pending.entries()].map(([flow, queue]) => ({
    flow,
    steps: [...queue.steps],
    picks: [...queue.picks.values()],
  }));
}
