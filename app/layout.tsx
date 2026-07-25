import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

// Zelf gehost: de app bouwt en laadt zonder verbinding met een fonts-CDN.
const bricolage = localFont({
  src: [
    { path: "./fonts/bricolage-grotesque-latin.woff2", weight: "400 800", style: "normal" },
    { path: "./fonts/bricolage-grotesque-latin-ext.woff2", weight: "400 800", style: "normal" },
  ],
  variable: "--font-bricolage",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const instrument = localFont({
  src: [
    { path: "./fonts/instrument-sans-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/instrument-sans-latin-ext.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-instrument",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const spline = localFont({
  src: [
    { path: "./fonts/spline-sans-mono-latin.woff2", weight: "400 600", style: "normal" },
    { path: "./fonts/spline-sans-mono-latin-ext.woff2", weight: "400 600", style: "normal" },
  ],
  variable: "--font-spline",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "Kasboek — affiliate-inkomsten",
    template: "%s · Kasboek",
  },
  description:
    "Al je affiliate-inkomsten uit Daisycon, TradeTracker, TradeDoubler, bol.com en Awin op één plek, met grafieken en trends.",
  applicationName: "Kasboek",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Kasboek", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Inzoomen blijft mogelijk; dat hoort bij een toegankelijke app.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0c" },
  ],
};

/**
 * Zet het opgeslagen thema nog voor de eerste paint, anders zie je bij een
 * donkere voorkeur eerst een lichte flits.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("kasboek-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nl"
      className={`${bricolage.variable} ${instrument.variable} ${spline.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
