import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html lang="en" className={`${notoSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-light text-dark">
        {children}
      </body>
    </html>
  );
}
