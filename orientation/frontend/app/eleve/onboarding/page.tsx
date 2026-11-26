"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Field, Notice, Progress, inputCls } from "@/components/ui";
import { api, errorMessage, getSessionUser, getToken, saveSession, type SessionUser } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import type { Meta } from "@/lib/types";
import { useSession } from "@/lib/useSession";

const BUDGETS = [
  { v: "", label: "Je ne sais pas / pas de contrainte" },
  { v: "0", label: "Uniquement le public gratuit" },
  { v: "5000", label: "Jusqu'à 5 000 MAD par an" },
  { v: "20000", label: "Jusqu'à 20 000 MAD par an" },
  { v: "60000", label: "Jusqu'à 60 000 MAD par an" },
  { v: "150000", label: "Plus de 60 000 MAD par an" },
];
const UNAVAILABLE_LEVELS = ["FR_1RE"]; // référentiel des spécialités abandonnées prévu en V1

export default function Onboarding() {
  const user = useSession(["student"]);
  const router = useRouter();
  const { setLocale } = useI18n();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [f, setF] = useState({
    system: "MA" as "MA" | "FR", language: "fr" as Locale, level: "", stream: "", fr_specialties: [] as string[], city: "",
    budget: "", mobility: "national", excluded_domains: [] as string[], certainty: 5, consent: false, shareCounselor: true, parentContact: "",
  });

  useEffect(() => {
    if (user) api<Meta>("/meta/levels").then(setMeta).catch((e) => setError(errorMessage(e)));
  }, [user]);

  if (!user || !meta) return null;
  const levels = Object.entries(meta.levels).filter(([, l]) => l.system === f.system);
  const streams = meta.streams[f.level];

  async function finish() {
    setError(null);
    try {
      await api("/students/me/profile", {
        method: "PUT",
        body: {
          system: f.system, level: f.level, stream: streams ? f.stream : null, fr_specialties: f.fr_specialties, language: f.language,
          city: f.city || null, budget_annual_mad: f.budget === "" ? null : Number(f.budget), mobility: f.mobility,
          excluded_domains: f.excluded_domains, certainty: f.certainty,
        },
      });
      await api("/students/me/consents", { body: { kind: "student_terms" } });
      if (f.shareCounselor) await api("/students/me/consents", { body: { kind: "share_counselor", scopes: ["profile", "pistes", "roadmap", "evidence", "grades"] } });
      if (f.parentContact.trim()) {
        const r = await api<{ invite_code: string | null }>("/students/me/parent-invite", { body: { contact: f.parentContact.trim() } });
        setInviteCode(r.invite_code);
      }
      const u = getSessionUser() as SessionUser;
      saveSession(getToken() as string, { ...u, onboarded: true });
      if (!f.parentContact.trim()) router.push("/eleve/evaluation");
      else setStep(4);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const canNext = [true, !!f.level && (!streams || !!f.stream) && (f.level !== "FR_TLE" || f.fr_specialties.length >= 2), true, f.consent][step];

  return (
    <div className="mx-auto max-w-xl">
      <Progress step={Math.min(step, 3)} total={4} labels={["Bienvenue", "Ma classe", "Mes contraintes", "Mon accord"]} />
      <Card className="fade-in space-y-4">
        {step === 0 && (
          <>
            <h1 className="text-2xl font-bold">Bienvenue {user.display_name} 👋</h1>
            <p className="text-slate-700">Pas besoin de savoir ce que tu veux faire plus tard. On va le découvrir ensemble, en 3 étapes d&apos;environ 10 minutes. Tu peux t&apos;arrêter et reprendre quand tu veux.</p>
            <fieldset>
              <legend className="mb-2 font-medium">Ton système scolaire</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["MA", "🇲🇦 Système marocain"], ["FR", "🇫🇷 Mission française / AEFE"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setF({ ...f, system: v, level: "", stream: "", fr_specialties: [] })} aria-pressed={f.system === v}
                    className={`rounded-xl border-2 p-3 text-start ${f.system === v ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}>{l}</button>
                ))}
              </div>
            </fieldset>
            <Field label="Langue de l'interface">
              <select className={inputCls} value={f.language} onChange={(e) => { setF({ ...f, language: e.target.value as Locale }); setLocale(e.target.value as Locale); }}>
                <option value="fr">Français</option>
                <option value="ar">العربية (interface)</option>
                <option value="en">English (interface)</option>
              </select>
            </Field>
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold">Ta classe</h2>
            <Field label="Niveau">
              <select className={inputCls} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value, stream: "" })}>
                <option value="">— Choisis —</option>
                {levels.map(([id, l]) => (
                  <option key={id} value={id} disabled={UNAVAILABLE_LEVELS.includes(id)}>
                    {l.label}{meta.mvp_levels.includes(id) ? "" : UNAVAILABLE_LEVELS.includes(id) ? " (bientôt)" : " (aperçu V1)"}
                  </option>
                ))}
              </select>
            </Field>
            {streams && (
              <Field label="Filière">
                <select className={inputCls} value={f.stream} onChange={(e) => setF({ ...f, stream: e.target.value })}>
                  <option value="">— Choisis —</option>
                  {streams.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
            )}
            {f.level === "FR_TLE" && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Tes spécialités de Terminale (2)</legend>
                <div className="flex flex-wrap gap-2">
                  {meta.fr_specialties.map((s) => {
                    const on = f.fr_specialties.includes(s.id);
                    return (
                      <button key={s.id} aria-pressed={on} onClick={() => setF({ ...f, fr_specialties: on ? f.fr_specialties.filter((x) => x !== s.id) : [...f.fr_specialties, s.id].slice(-2) })}
                        className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>{s.label}</button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <Field label="Ta ville" hint="Sert uniquement à te signaler les formations proches si tu ne veux pas déménager.">
              <input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={100} />
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold">Tes contraintes</h2>
            <p className="text-sm text-slate-600">Elles servent à te prévenir, jamais à retirer une piste en silence.</p>
            <Field label="Budget annuel des études (frais de scolarité)">
              <select className={inputCls} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })}>
                {BUDGETS.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}
              </select>
            </Field>
            <Field label="Mobilité">
              <select className={inputCls} value={f.mobility} onChange={(e) => setF({ ...f, mobility: e.target.value })}>
                <option value="local">Je préfère rester dans ma ville</option>
                <option value="national">Je peux étudier ailleurs au Maroc</option>
                <option value="international">Je peux partir à l&apos;étranger</option>
              </select>
            </Field>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Domaines que tu exclus pour l&apos;instant (facultatif)</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meta.domains).filter(([k]) => !["general", "sciences", "lettres"].includes(k)).map(([k, l]) => {
                  const on = f.excluded_domains.includes(k);
                  return (
                    <button key={k} aria-pressed={on} onClick={() => setF({ ...f, excluded_domains: on ? f.excluded_domains.filter((x) => x !== k) : [...f.excluded_domains, k] })}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-slate-700 bg-slate-700 text-white line-through" : "border-slate-300"}`}>{l}</button>
                  );
                })}
              </div>
            </fieldset>
            <Field label={`À quel point ton projet te semble clair aujourd'hui ? ${f.certainty}/10`}>
              <input type="range" min={0} max={10} value={f.certainty} onChange={(e) => setF({ ...f, certainty: Number(e.target.value) })} className="w-full" />
            </Field>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="text-xl font-semibold">Ton accord</h2>
            <ul className="space-y-2 text-slate-700">
              <li>📝 On enregistre tes réponses, tes notes et tes preuves pour te proposer des pistes.</li>
              <li>🔒 Ton nom n&apos;est jamais transmis aux outils d&apos;IA ; tes données restent hébergées au Maroc.</li>
              <li>👀 Tu choisis ce que voient tes parents et ton conseiller, et tu peux changer d&apos;avis à tout moment.</li>
            </ul>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
              <span>J&apos;ai compris et j&apos;accepte.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={f.shareCounselor} onChange={(e) => setF({ ...f, shareCounselor: e.target.checked })} />
              <span>Je partage mes pistes, ma feuille de route, mes preuves et mes notes avec le conseiller d&apos;orientation de mon établissement.</span>
            </label>
            <Field label="Téléphone ou e-mail d'un parent / représentant légal" hint="Il recevra une invitation pour valider ton inscription (obligatoire pour les mineurs).">
              <input className={inputCls} value={f.parentContact} onChange={(e) => setF({ ...f, parentContact: e.target.value })} />
            </Field>
          </>
        )}
        {step === 4 && (
          <>
            <h2 className="text-xl font-semibold">Invitation envoyée ✉️</h2>
            <p>Ton parent doit valider ton inscription. En attendant, tu peux déjà commencer l&apos;évaluation.</p>
            {inviteCode && (
              <Notice tone="info">
                Mode démonstration : le code d&apos;invitation est <strong className="font-mono">{inviteCode}</strong>. Ton parent peut l&apos;utiliser sur la page « Je suis parent ».
              </Notice>
            )}
            <Button onClick={() => router.push("/eleve/evaluation")} className="w-full">Commencer l&apos;évaluation</Button>
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {step < 4 && (
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Retour</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Suivant</Button>
            ) : (
              <Button onClick={finish} disabled={!canNext}>Valider</Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
