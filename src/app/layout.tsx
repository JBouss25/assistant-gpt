import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConfigBanner } from "@/components/config-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Mentora — Le bon enseignant, au bon moment", template: "%s · Mentora" },
  description:
    "Mentora met en relation élèves de collège, lycée, CPGE et université avec des enseignants qualifiés, grâce à un matching intelligent.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.webp", apple: "/icons/icon-512.webp" },
  appleWebApp: { capable: true, title: "Mentora", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Plein écran sur mobile (encoche iPhone) : les marges de sécurité sont gérées en CSS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf4" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a15" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ConfigBanner />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
