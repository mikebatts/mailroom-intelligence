import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Mailroom Intelligence",
  description:
    "AI mail triage demo: vision extraction, confidence-based routing, human review queue, and a measured eval. Built by Mike Battaglia.",
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
