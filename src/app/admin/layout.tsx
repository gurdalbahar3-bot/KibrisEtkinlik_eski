import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AdminI18nProvider } from "@/components/admin/AdminI18nProvider";
import { getAdminMessages, resolveAdminLocale } from "@/lib/admin/i18n";
import "../globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Super Admin | Global Event Discovery",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);

  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        <AdminI18nProvider messages={messages}>{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
