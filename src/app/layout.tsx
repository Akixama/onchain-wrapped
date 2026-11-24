import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
});
const display = localFont({
  src: [
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Wrapped Onchain — your trading year, wrapped",
  description: "Paste any Solana wallet and get a swipeable story of your onchain trading life. Best trade, worst trade, round trips, gas burned and more.",
  openGraph: { images: [{ url: "/api/og/home/summary", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full bg-black font-sans text-white">{children}</body>
    </html>
  );
}
