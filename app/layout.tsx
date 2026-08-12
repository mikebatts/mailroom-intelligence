import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mailroom-intelligence.vercel.app"),
  title: "Mailroom Intelligence",
  description:
    "AI mail triage demo: vision extraction, confidence-based routing, human review queue, and a measured eval. Built by Mike Battaglia.",
  openGraph: {
    title: "Mailroom Intelligence",
    description: "Scan. Extract. Route. Review. AI mail triage with the eval to prove it.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mailroom Intelligence",
    description: "Scan. Extract. Route. Review. AI mail triage with the eval to prove it.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
