"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { clearSession } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { useSessionUser } from "@/lib/useSession";

const NAV: Record<string, { href: string; key: string }[]> = {
  student: [
    { href: "/eleve", key: "home" },
    { href: "/eleve/simulateur", key: "simulator" },
    { href: "/eleve/voeux", key: "wishes" },
    { href: "/eleve/carnet", key: "notebook" },
    { href: "/eleve/partage", key: "sharing" },
    { href: "/explorer", key: "explorer" },
  ],
  parent: [{ href: "/parent", key: "home" }, { href: "/explorer", key: "explorer" }],
  counselor: [{ href: "/conseiller", key: "home" }, { href: "/explorer", key: "explorer" }],
  school_admin: [{ href: "/admin", key: "home" }, { href: "/conseiller", key: "home" }, { href: "/explorer", key: "explorer" }],
  editor: [{ href: "/backoffice", key: "home" }, { href: "/explorer", key: "explorer" }],
  committee: [{ href: "/backoffice", key: "home" }, { href: "/explorer", key: "explorer" }],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale, dyslexia, setDyslexia } = useI18n();
  const user = useSessionUser();
  const pathname = usePathname();
  const router = useRouter();

  const nav = user ? NAV[user.role] ?? [] : [];
  const uniqueNav = nav.filter((n, i) => nav.findIndex((m) => m.href === n.href) === i);

  return (
    <div className="min-h-screen">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        Aller au contenu
      </a>
      <div className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">{t("demoBanner")}</div>
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <Link href="/" className="whitespace-nowrap font-bold text-brand-700">
            🧭 {t("appName")}
          </Link>
          <div className="ms-auto flex items-center gap-1 text-sm sm:gap-2">
            <label className="sr-only" htmlFor="lang">
              Langue
            </label>
            <select id="lang" value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="rounded-lg border border-slate-300 px-2 py-1">
              <option value="fr">FR</option>
              <option value="ar">ع</option>
              <option value="en">EN</option>
            </select>
            <button
              onClick={() => setDyslexia(!dyslexia)}
              aria-pressed={dyslexia}
              className={`rounded-lg border px-2 py-1 ${dyslexia ? "border-brand-600 bg-brand-50" : "border-slate-300"}`}
              title={t("dyslexia")}
            >
              Aa
            </button>
            <Link href="/aide" className="rounded-lg px-2 py-1 hover:bg-slate-100">
              {t("help")}
            </Link>
            {user && (
              <button
                onClick={() => {
                  clearSession();
                  router.push("/");
                }}
                className="whitespace-nowrap rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
                aria-label={t("logout")}
                title={t("logout")}
              >
                <span aria-hidden className="sm:hidden">⎋</span>
                <span className="hidden sm:inline">{t("logout")}</span>
              </button>
            )}
          </div>
        </div>
        {uniqueNav.length > 0 && (
          <nav aria-label="Navigation principale" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
            {uniqueNav.map((n) => {
              const active = pathname === n.href || (n.href !== "/eleve" && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${active ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {t(n.key)}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main id="contenu" className="mx-auto max-w-5xl px-4 py-5">
        {children}
      </main>
    </div>
  );
}
