import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { seasonThemeScript, themeStylesheet } from "../lib/season";
import { DecorDrift } from "../components/SeasonDecor";

// Order Desk type system: Space Grotesk for display + UI, JetBrains Mono for
// spec furniture only (ticket numbers, timestamps, statuses, size grids).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-spec",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gorilla Labs — Custom Print Quotes | Gorilla Salem",
  description:
    "Design your custom stickers or apparel and get a quote from Gorilla Salem — hand-printed locally in Salem, MA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
      // The season script below sets data-theme on <html> before React
      // hydrates, so the server's markup and the browser's differ by that
      // one attribute on purpose.
      suppressHydrationWarning
    >
      <head>
        {/* The theme calendar (lib/theme-calendar.ts). The script is inline
            and first so the right inks are on before the first paint; the
            page is static, so this is what makes each holiday arrive with
            no deploy. The style holds every theme's colours and decor,
            written at build time; only today's theme matches. */}
        <script dangerouslySetInnerHTML={{ __html: seasonThemeScript() }} />
        <style id="theme-calendar" dangerouslySetInnerHTML={{ __html: themeStylesheet() }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Drifting decor (snow, leaves, hearts…): hidden unless today's
            theme has some. */}
        <DecorDrift />
        {children}
        {/**
         * SHIPS DARK.
         *
         * Vercel Web Analytics is a per-project toggle in the dashboard.
         * Until the shop turns it on the script is not served, this renders
         * nothing that collects anything, and the five events in
         * lib/analytics.ts go nowhere. Adding the code and enabling the
         * collection are deliberately two separate acts, and the second is
         * Gabe's.
         *
         * It is cookieless and stores no identifier, which is why it sits
         * here rather than behind a consent banner the shop has no other
         * reason to run. See lib/analytics.ts for what is sent — five named
         * events, no PII, and totals as a band rather than a figure.
         */}
        <Analytics />
      </body>
    </html>
  );
}
