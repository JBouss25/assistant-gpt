import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { RegisterSW } from "@/components/RegisterSW";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orientation 4.0",
  description: "Aide à l'orientation scolaire et professionnelle — Maroc et mission française.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d4ed8" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" dir="ltr">
      <body>
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
