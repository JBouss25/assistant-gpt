"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Field, Notice, inputCls } from "@/components/ui";
import { api, errorMessage, getSessionUser, homeFor, saveSession, type SessionUser } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const DEMO_ACCOUNTS = [
  { email: "sami@demo.ma", label: "Sami — 3e (3AC), nouveau compte : parcours complet" },
  { email: "yasmine@demo.ma", label: "Yasmine — Tronc commun sciences, Casablanca" },
  { email: "adam@demo.ma", label: "Adam — 2e Bac PC, Meknès" },
  { email: "lea@demo.fr", label: "Léa — Terminale mission française, Rabat" },
  { email: "parent.yasmine@demo.ma", label: "Parent de Yasmine" },
  { email: "conseiller.casa@demo.ma", label: "Conseiller d'orientation — Casablanca" },
  { email: "admin.casa@demo.ma", label: "Direction — Casablanca" },
  { email: "editeur@demo.ma", label: "Éditeur du référentiel" },
  { email: "comite@demo.ma", label: "Comité scientifique" },
];

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = getSessionUser();
    if (u) router.replace(homeFor(u.role));
  }, [router]);

  async function login(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/login", { body: { email: e, password: p } });
      saveSession(res.token, res.user);
      router.push(res.user.role === "student" && !res.user.onboarded ? "/eleve/onboarding" : homeFor(res.user.role));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold leading-tight text-brand-900">Pas besoin de savoir ce que tu veux faire plus tard. On va le découvrir ensemble.</h1>
        <p className="text-lg text-slate-700">{t("tagline")}</p>
        <ul className="space-y-2 text-slate-700">
          <li>🧩 Des compétences avant les étiquettes : on part de qui tu es et de ce que tu sais faire.</li>
          <li>🤖 Pour chaque métier : ce que l&apos;IA automatise, ce qu&apos;elle augmente, ce qui reste humain.</li>
          <li>🅰️🅱️©️ Toujours un plan A, B et C, avec des passerelles : aucune voie n&apos;est une impasse.</li>
          <li>🤝 Tu décides, avec ta famille et ton conseiller. La plateforme éclaire, elle ne tranche pas.</li>
        </ul>
      </div>
      <div className="space-y-4">
        <Card>
          <h2 className="mb-3 text-xl font-semibold">{t("login")}</h2>
          <form
            className="space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              login(email, password);
            }}
          >
            <Field label={t("email")}>
              <input className={inputCls} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t("password")}>
              <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" disabled={busy} className="w-full">
              {t("login")}
            </Button>
          </form>
          <p className="mt-3 text-sm">
            Pas encore de compte ? <Link className="text-brand-700 underline" href="/inscription">Créer un compte élève</Link> ·{" "}
            <Link className="text-brand-700 underline" href="/parent/inscription">Je suis parent (code d&apos;invitation)</Link>
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Comptes de démonstration (mot de passe : demo1234)</h2>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} onClick={() => login(a.email, "demo1234")} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-2 text-start text-sm hover:bg-brand-50">
                <span className="font-medium">{a.label}</span>
                <span className="block text-xs text-slate-500">{a.email}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
