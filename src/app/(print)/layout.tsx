import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import "./print.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
export const metadata: Metadata = { title: "CSIU District Insights — report" };
export const dynamic = "force-dynamic";

/** Separate root layout for printable reports: no app chrome, print-tuned typography and page breaks. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="print-body">{children}</body>
    </html>
  );
}
