import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";

import "../globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  variable: "--font-organizer-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Organizer | Kıbrıs Etkinlik",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OrganizerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={sourceSans.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
