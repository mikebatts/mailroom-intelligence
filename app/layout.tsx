import type { Metadata } from "next";
import { Archivo, Archivo_Black, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: ["400"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mailroom-intelligence.vercel.app"),
  title: "Mailroom Intelligence",
  description:
    "AI mail triage demo: vision extraction, confidence-based routing, human review queue, and a measured eval. Built by Mike Battaglia.",
  openGraph: {
    title: "Mailroom Intelligence",
    description: "Scan → extract → route → review. AI mail triage with the eval to prove it.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mailroom Intelligence",
    description: "Scan → extract → route → review. AI mail triage with the eval to prove it.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${archivoBlack.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ color: "var(--readout)" }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
