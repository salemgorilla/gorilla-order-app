import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
    >
      <body className="min-h-full flex flex-col">
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
