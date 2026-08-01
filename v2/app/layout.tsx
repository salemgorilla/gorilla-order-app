import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
