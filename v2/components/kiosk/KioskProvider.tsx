"use client";

import { createContext, useContext, useMemo } from "react";

import type { KioskMode } from "../../lib/kiosk";

export type KioskContextValue = {
  /** False on the public website. Everything downstream keys off this. */
  enabled: boolean;
  mode: KioskMode;
  staffName: string;
  /** End the customer's session and wipe the screen. */
  endSession: () => void;
};

const KioskContext = createContext<KioskContextValue>({
  enabled: false,
  mode: "self",
  staffName: "",
  endSession: () => {},
});

/**
 * Kiosk state, read by the order flow.
 *
 * A context rather than props because the order flow is one large component
 * and the alternative was threading a flag through every level of it. The
 * default value is the WEBSITE — so a component that forgets to consider
 * kiosk mode behaves exactly as it does today, which is the safe direction
 * for a default to fail in.
 */
export function useKiosk() {
  return useContext(KioskContext);
}

export function KioskProvider({
  mode,
  staffName,
  endSession,
  children,
}: {
  mode: KioskMode;
  staffName: string;
  endSession: () => void;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ enabled: true, mode, staffName, endSession }),
    [mode, staffName, endSession]
  );

  return (
    <KioskContext.Provider value={value}>{children}</KioskContext.Provider>
  );
}
