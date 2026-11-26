"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PisteCard } from "@/components/PisteCard";
import { Button, Card, Loading, Notice, Pill } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Category, Recommendation } from "@/lib/types";
import { useSession } from "@/lib/useSession";

const RIASEC_NAMES: Record<string, string> = { R: "Réaliste", I: "Investigateur", A: "Artistique", S: "Social", E: "Entreprenant", C: "Conventionnel" };
interface Profile { system: string; level: string; stream: string | null; fr_specialties: string[]; language: string; city: string | null; budget_annual_mad: number | null; mobility: string; excluded_domains: string[]; certainty_history: { value: number }[]; onboarded: boolean }
interface CalEvent { id: string; label: string; date: string; source: { title: string } }
interface Milestone { id: number; label: string; status: "todo" | "doing" | "done" }

function Dashboard() {
  const user = useSession(["student"]);
  const router = useRouter();
  const params = useSearchParams();
  const [reco, setReco] = useState<Recommendation | null>(null);
  const [missing, setMissing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [traits, setTraits] = useState<{ holland_code?: string; ai_feedback?: { id: string; correct: boolean; feedback: string }[] }>({});
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftCertainty, setDraftCertainty] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const p = await api<Profile>("/students/me/profile");
        if (!p.onboarded) return router.replace("/eleve/onboarding");
        setProfile(p);
        const [t, m, cal] = await Promise.all([
          api<typeof traits>("/students/me/traits"),
          api<Milestone[]>("/students/me/milestones"),
          api<CalEvent[]>(`/explorer/calendar?system=${p.system}&level=${p.level}`),
        ]);
        setTraits(t);
        setMilestones(m);
        setEvents(cal.filter((e) => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 3));
        setReco(await api<Recommendation>("/students/me/recommendations/latest"));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError(errorMessage(e));
      }
    })();
  }, [user, router]);

  async function recompute() {
    setBusy(true);
    setError(null);
    try {
      setReco(await api<Recommendation>("/students/me/recommendations", { body: {} }));
      setMissing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setCertainty(v: number) {
    if (!profile) return;
    const { certainty_history, onboarded, ...rest } = profile;
    void onboarded;
    if (v === certainty_history.at(-1)?.value) return;
    try {
      const updated = await api<Profile>("/students/me/profile", { method: "PUT", body: { ...rest, certainty: v } });
      setProfile({ ...profile, certainty_history: updated.certainty_history });
      setDraftCertainty(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function addMilestone(label: string, program_id?: string) {
    const m = await api<Milestone>("/students/me/milestones", { body: { label, program_id } });
    setMilestones([...milestones, m]);
  }

  async function toggleMilestone(m: Milestone) {
    const status = m.status === "done" ? "todo" : "done";
    const u = await api<Milestone>(`/students/me/milestones/${m.id}`, { method: "PATCH", body: { label: m.label, status } });
    setMilestones(milestones.map((x) => (x.id === m.id ? u : x)));
  }

  if (!user || !profile) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const college = ["MA_3AC", "FR_3E"].includes(profile.level);
  const certainty = profile.certainty_history.at(-1)?.value ?? 5;
  const holland = traits.holland_code ?? "";

  return (
    <div className="space-y-5">
      {params.get("attente") && (
        <Notice tone="warn">
          Ton évaluation est enregistrée. Tes pistes seront calculées dès que ton parent ou représentant légal aura validé ton inscription.{" "}
          <Link className="underline" href="/eleve/partage">Voir l&apos;invitation</Link>
        </Notice>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Salut {user.display_name} 👋</h1>
          {holland && <p className="text-slate-700">Ton profil : <strong>{holland.slice(0, 2).split("").map((c) => RIASEC_NAMES[c]).join("-")}</strong></p>}
        </div>
        {reco && <Pill>Bilan n° {reco.run_id} · {new Date(reco.created_at).toLocaleDateString("fr-FR")} · référentiel {reco.referential_version}</Pill>}
      </div>

      {missing && (
        <Card>
          <h2 className="text-lg font-semibold">On commence ?</h2>
          <p className="mt-1 text-slate-700">25 à 35 minutes, en 3 étapes, découpables en plusieurs fois.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => router.push("/eleve/evaluation")}>Commencer ou reprendre l&apos;évaluation</Button>
            <Button variant="secondary" onClick={recompute} disabled={busy}>J&apos;ai déjà terminé : calculer mes pistes</Button>
          </div>
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Certitude de mon projet</h2>
          <input aria-label="Certitude du projet sur 10" type="range" min={0} max={10} value={draftCertainty ?? certainty} className="mt-2 w-full"
            onChange={(e) => setDraftCertainty(Number(e.target.value))}
            onPointerUp={() => draftCertainty !== null && setCertainty(draftCertainty)}
            onKeyUp={() => draftCertainty !== null && setCertainty(draftCertainty)} />
          <p className="text-sm text-slate-600">{draftCertainty ?? certainty}/10 — ça peut bouger, c&apos;est normal.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Prochaines échéances</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {events.length === 0 && <li className="text-slate-500">Aucune échéance à venir.</li>}
            {events.map((e) => <li key={e.id}><strong>{new Date(e.date).toLocaleDateString("fr-FR")}</strong> — {e.label}</li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Ma feuille de route</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {milestones.length === 0 && <li className="text-slate-500">Ajoute des actions depuis tes pistes.</li>}
            {milestones.slice(0, 5).map((m) => (
              <li key={m.id}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={m.status === "done"} onChange={() => toggleMilestone(m)} />
                  <span className={m.status === "done" ? "text-slate-400 line-through" : ""}>{m.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {reco && (
        <>
          {reco.signals.map((s) => <Notice key={s.message} tone="info">💡 {s.message}</Notice>)}
          {reco.warnings.map((w) => <Notice key={w.message} tone="warn">{w.message}</Notice>)}
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-xl font-bold">{college ? "3 voies de lycée possibles" : "Mes pistes"}</h2>
            <Button variant="ghost" onClick={recompute} disabled={busy}>↻ Recalculer</Button>
          </div>
          {college ? (
            <div className="grid gap-3 md:grid-cols-3">{reco.items.map((i) => <PisteCard key={i.program_id} item={i} college />)}</div>
          ) : (
            (["A", "B", "C"] as Category[]).map((c) => {
              const items = reco.items.filter((i) => i.category === c);
              if (!items.length) return null;
              return (
                <section key={c}>
                  <h3 className="mb-2 font-semibold text-slate-700">{{ A: "A · Ambition", B: "B · Cible réaliste", C: "C · Voie sécurisée (avec passerelles)" }[c]}</h3>
                  <div className="grid gap-3 md:grid-cols-2">{items.map((i) => <PisteCard key={i.program_id} item={i} />)}</div>
                </section>
              );
            })
          )}
          {college && (
            <Card>
              <h2 className="text-lg font-semibold">Mes 3 prochaines actions</h2>
              <ol className="mt-2 space-y-2">
                {Array.from(new Set(reco.items.flatMap((i) => i.roadmap_6_12m.slice(0, 2)))).slice(0, 3).map((a) => (
                  <li key={a} className="flex items-start gap-2">
                    <span className="flex-1">✅ {a}</span>
                    <Button variant="ghost" className="min-h-8 px-2 text-sm" onClick={() => addMilestone(a)}>+ à mon plan</Button>
                  </li>
                ))}
              </ol>
              <Link href="/eleve/partage" className="mt-3 inline-block text-brand-700 underline">Partager avec mes parents</Link>
            </Card>
          )}
          {reco.blocked.length > 0 && (
            <details className="rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-medium">Formations non accessibles depuis ta situation actuelle ({reco.blocked.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {reco.blocked.map((b) => (
                  <li key={b.program_id}>
                    <strong>{b.short}</strong> — {b.message}
                    {b.alternatives_details.length > 0 && <> Voies d&apos;accès : {b.alternatives_details.map((a) => a.short).join(", ")}.</>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {traits.ai_feedback && traits.ai_feedback.length > 0 && (
            <Card>
              <h2 className="font-semibold">🤖 Ton esprit critique face à l&apos;IA</h2>
              <ul className="mt-2 space-y-1 text-sm">{traits.ai_feedback.map((f) => <li key={f.id}>{f.correct ? "✅" : "💡"} {f.feedback}</li>)}</ul>
            </Card>
          )}
          <p className="text-sm italic text-slate-600">{reco.disclaimer}</p>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
