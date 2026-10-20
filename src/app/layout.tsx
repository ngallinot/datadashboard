import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { TopBar } from "@/components/TopBar";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "CSIU District Insights",
  description: "Regional data and AI decision support for CSIU 16 member districts — clickable prototype with sample data.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TopBar />
        <div className="flex-1">{children}</div>
        <footer className="no-print mt-10 border-t border-line py-5 text-center text-[12px] text-ink-3">
          District data remains the property of the district and is protected under FERPA. Predictions support professional judgment; they do not replace it.
        </footer>
      </body>
    </html>
  );
}
