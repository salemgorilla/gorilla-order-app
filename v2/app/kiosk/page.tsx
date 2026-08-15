"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import Home from "../page";
import { KioskProvider } from "../../components/kiosk/KioskProvider";
import KioskChrome from "../../components/kiosk/KioskChrome";
import IdleReset from "../../components/kiosk/IdleReset";
import StaffGate from "../../components/kiosk/StaffGate";
import {
  getStaffServerSnapshot,
  getStaffSnapshot,
  setStaff,
  subscribeStaff,
} from "../../components/kiosk/staffStore";
import { KIOSK_IDLE_MS } from "../../lib/kiosk";

/**
 * The order desk, running on the machine in the front of the shop.
 *
 * Renders the SAME order flow as the website. Not a copy — a copy would drift,
 * and the day it drifted would be the day the kiosk quoted a price the site
 * did not. What changes is the behaviour around it: how a session ends, what
 * is assumed about consent, and whether anything takes money unattended.
 *
 * ── HOW A SESSION IS ENDED ────────────────────────────────────────────────
 * By REMOUNTING the flow, keyed on a session id — not by resetting fields.
 *
 * The flow holds around twenty pieces of state plus object URLs for previews
 * and knockouts. Resetting that by hand means listing every one correctly,
 * forever, and the failure mode is the previous customer's email address still
 * sitting in a box when the next person walks up. Discarding the component
 * makes the guarantee structural: React throws the state away, and anything
 * added later is covered without anyone remembering to.
 * ──────────────────────────────────────────────────────────────────────────
 */
export default function KioskPage() {
  const [sessionId, setSessionId] = useState(0);
  const [showStaffGate, setShowStaffGate] = useState(false);
  /** Set once the customer has sent their order, so the reset can be brisker. */
  const [finished, setFinished] = useState(false);

  // Staff stay signed in across customers for the length of a shift — being
  // asked for a PIN after every single write-up is how a shop ends up wedging
  // the kiosk into staff mode permanently to avoid the friction.
  const staffName = useSyncExternalStore(
    subscribeStaff,
    getStaffSnapshot,
    getStaffServerSnapshot
  );

  // Derived, never stored. Two pieces of state that must agree is two pieces
  // of state that can disagree — and disagreeing here means a screen that
  // says self-service while writing the order up under someone's name.
  const mode = staffName ? "staff" : "self";

  const startNewSession = useCallback(() => {
    setSessionId((id) => id + 1);
    setFinished(false);
  }, []);

  const signOutStaff = useCallback(() => {
    setStaff("");
    // Handing the machine back to customers discards the order in progress:
    // it was written up for somebody, and it is not the next person's.
    setSessionId((id) => id + 1);
    setFinished(false);
  }, []);

  const onStaffSignedIn = useCallback((name: string) => {
    setStaff(name);
    setShowStaffGate(false);
    setSessionId((id) => id + 1);
    setFinished(false);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--shirt-blank)]">
      <KioskChrome
        mode={mode}
        staffName={staffName}
        onStartNew={startNewSession}
        onOpenStaffGate={() => setShowStaffGate(true)}
        onSignOutStaff={signOutStaff}
      />

      <IdleReset
        // Restarting the timer on a new session is the point — otherwise the
        // countdown carries over and the next customer inherits a clock that
        // is already half spent.
        key={`idle-${sessionId}-${finished}`}
        idleMs={KIOSK_IDLE_MS}
        finished={finished}
        onReset={startNewSession}
      />

      {showStaffGate && (
        <StaffGate
          onCancel={() => setShowStaffGate(false)}
          onSignedIn={onStaffSignedIn}
        />
      )}

      <KioskProvider
        mode={mode}
        staffName={staffName}
        endSession={startNewSession}
      >
        <SessionWatcher key={sessionId} onFinished={() => setFinished(true)}>
          <Home />
        </SessionWatcher>
      </KioskProvider>
    </div>
  );
}

/**
 * Notices when the order flow reaches its confirmation screen.
 *
 * Read from the DOM rather than plumbed through the flow's state: the flow is
 * shared with the website and should not have to know a kiosk exists. The
 * confirmation is the one screen that announces itself in the accessibility
 * tree, so it is already a reliable signal.
 */
function SessionWatcher({
  onFinished,
  children,
}: {
  onFinished: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const check = () => {
      if (node.querySelector("[data-quote-confirmed]")) onFinished();
    };

    check();
    const observer = new MutationObserver(check);
    observer.observe(node, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [onFinished]);

  return <div ref={ref}>{children}</div>;
}
