"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, Button, Card, CategoryBadge, Loading, Notice, Pill, ScoreRange, Tabs, fmtMoney } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { COMPONENT_LABELS, type Item, type Recommendation, type Source } from "@/lib/types";
import { useSession } from "@/lib/useSession";

const TABS = [
  { id: "why", label: "Pourquoi toi" },
  { id: "job", label: "Le métier en 2031" },
  { id: "prereq", label: "Prérequis" },
  { id: "bridges", label: "Passerelles" },
  { id: "plan", label: "Plan 6–12 mois" },
  { id: "sources", label: "Sources et date" },
];

export default function PisteDetail() {
  const user = useSession(["student"]);
  const { id } = useParams<{ id: string }>();
  const [reco, setReco] = useState<Recommendation | null>(null);
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [tab, setTab] = useState("why");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Recommendation>("/students/me/recommendations/latest"), api<{ sources: Source[] }>("/explorer/sources")])
      .then(([r, s]) => {
        setReco(r);
        setSources(Object.fromEntries(s.sources.map((x) => [x.id, x])));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!reco) return <Loading />;
  const item: Item | undefined = reco.items.find((i) => i.program_id === decodeURIComponent(id));
  if (!item) return <Notice tone="warn">Cette piste ne fait plus partie de ton bilan actuel.</Notice>;
  const t = item.ai_impact.transformation;

  async function addToPlan(label: string) {
    await api("/students/me/milestones", { body: { label, program_id: item!.program_id } });
    setAdded([...added, label]);
  }

  return (
    <div className="space-y-4">
      <Link href="/eleve" className="text-sm text-brand-700 underline">← Mes pistes</Link>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <h1 className="flex-1 text-2xl font-bold">{item.name}</h1>
          {item.type === "program" && <CategoryBadge category={item.category} />}
          {item.exploratory && <Pill tone="amber">🧭 exploratoire</Pill>}
        </div>
        <ScoreRange low={item.fit_score.low} high={item.fit_score.high} label={item.fit_score.label} />
        {!item.admission_probability.open_access && item.type === "program" && (
          <p className="text-sm text-slate-700">
            Probabilité d&apos;admission estimée : <strong>{Math.round(item.admission_probability.low * 100)} à {Math.round(item.admission_probability.high * 100)} %</strong>{" "}
            (seuils {item.admission_probability.as_of ? `au ${new Date(item.admission_probability.as_of).toLocaleDateString("fr-FR")}` : ""} — une estimation, jamais une promesse).
          </p>
        )}
      </Card>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <Card className="fade-in space-y-3" key={tab}>
        {tab === "why" && (
          <>
            <h2 className="font-semibold">Ce qui compose ton score ({item.fit_score.value.toFixed(1).replace(".", ",")} / 100)</h2>
            {Object.entries(item.contribution_points).sort((a, b) => b[1] - a[1]).map(([k, pts]) => (
              <Bar key={k} label={`${COMPONENT_LABELS[k]} — ${Math.round(item.contributions[k] * 100)} % du score`} value={pts} max={Math.max(...Object.values(item.contribution_points))} hint={`${pts.toFixed(1).replace(".", ",")} pts`} />
            ))}
            <ul className="list-disc space-y-1 ps-5 text-slate-700">{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <Notice tone="info">🔁 {item.counterfactual}</Notice>
          </>
        )}
        {tab === "job" && (
          <>
            <h2 className="font-semibold">{item.ai_impact.occupation_name} : ce qui change d&apos;ici 2031</h2>
            <div className="flex h-4 overflow-hidden rounded-full" aria-label={`Temps de travail : ${Math.round(t.a * 100)} % automatisable, ${Math.round(t.b * 100)} % augmenté, ${Math.round(t.c * 100)} % humain`}>
              <div className="bg-slate-400" style={{ width: `${t.a * 100}%` }} />
              <div className="bg-violet-500" style={{ width: `${t.b * 100}%` }} />
              <div className="bg-emerald-500" style={{ width: `${t.c * 100}%` }} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {([["Automatisé par l'IA", item.ai_impact.automated, "bg-slate-50", Math.round(t.a * 100)],
                ["Augmenté par l'IA (tu pilotes)", item.ai_impact.augmented, "bg-violet-50", Math.round(t.b * 100)],
                ["Profondément humain", item.ai_impact.human_core, "bg-emerald-50", Math.round(t.c * 100)]] as const).map(([title, list, bg, pct]) => (
                <div key={title} className={`rounded-xl p-3 ${bg}`}>
                  <p className="font-medium">{title} · {pct} %</p>
                  <ul className="mt-1 list-disc ps-5 text-sm">{list.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
            <h3 className="font-medium">Métiers visés</h3>
            <ul className="space-y-1 text-sm">
              {item.occupations.map((o) => (
                <li key={o.id}>
                  <Link className="text-brand-700 underline" href={`/explorer/metier/${o.id}`}>{o.name}</Link> — Avenir +5 : {o.avenir.toString().replace(".", ",")}/100
                  <span className="text-slate-500"> (demande {o.D}, part humaine/augmentée {o.H}, accessibilité {o.A}, mobilité {o.M} · au {new Date(o.as_of).toLocaleDateString("fr-FR")})</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "prereq" && (
          <>
            <ul className="list-disc space-y-1 ps-5">{item.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>
            {item.admission_probability.exam && <p>Modalité : {item.admission_probability.exam}</p>}
            <p>Coût : {fmtMoney(item.cost)}{item.cost?.note ? ` (${item.cost.note})` : ""} · Durée : {item.duration_years} an(s)</p>
            {item.cities.length > 0 && <p>Villes : {item.cities.join(", ")}</p>}
            {item.flags.map((f) => <Notice key={f.message} tone="warn">{f.message}</Notice>)}
          </>
        )}
        {tab === "bridges" && (
          <>
            {item.leads_to_details.length > 0 && (
              <>
                <h2 className="font-semibold">Ce que cette voie ouvre ensuite</h2>
                <ul className="list-disc ps-5">{item.leads_to_details.map((b) => <li key={b.id}><Link className="text-brand-700 underline" href={`/explorer/formation/${b.id}`}>{b.short}</Link></li>)}</ul>
              </>
            )}
            <h2 className="font-semibold">Passerelles pour rebondir ou remonter</h2>
            {item.bridges_details.length ? (
              <ul className="list-disc ps-5">{item.bridges_details.map((b) => <li key={b.id}><Link className="text-brand-700 underline" href={`/explorer/formation/${b.id}`}>{b.name}</Link></li>)}</ul>
            ) : <p className="text-slate-600">Aucune passerelle référencée pour l&apos;instant.</p>}
          </>
        )}
        {tab === "plan" && (
          <ol className="space-y-2">
            {item.roadmap_6_12m.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span className="flex-1">• {s}</span>
                <Button variant="ghost" className="min-h-8 px-2 text-sm" disabled={added.includes(s)} onClick={() => addToPlan(s)}>{added.includes(s) ? "Ajouté ✓" : "+ à mon plan"}</Button>
              </li>
            ))}
          </ol>
        )}
        {tab === "sources" && (
          <>
            <p className="text-sm">Bilan calculé le {new Date(reco.created_at).toLocaleString("fr-FR")} · modèle {reco.model_version} · pondérations {reco.weights_version} · référentiel {reco.referential_version}</p>
            <ul className="space-y-1 text-sm">
              {item.citations.map((c) => {
                const s = sources[c];
                return (
                  <li key={c}>
                    <Pill tone={s?.reliability === "demo" || s?.reliability === "estimation_comite" ? "amber" : "green"}>{s?.reliability ?? "?"}</Pill>{" "}
                    {s?.url ? <a className="text-brand-700 underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s?.title ?? c} {s && `· ${new Date(s.as_of).toLocaleDateString("fr-FR")}`}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <p className="text-sm italic text-slate-600">{reco.disclaimer}</p>
    </div>
  );
}
