import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";

import { NavigationHistoryTracker } from "@/components/navigation-guard";

import "./globals.css";

const plexSans = IBM_Plex_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
});

const plexSerif = IBM_Plex_Serif({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plex-serif",
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Kaul",
  description: "Grund för ett svenskt system för social dokumentation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body
        className={`${plexSans.variable} ${plexSerif.variable} ${plexMono.variable}`}
      >
        <NavigationHistoryTracker>{children}</NavigationHistoryTracker>
      </body>
    </html>
  );
}
