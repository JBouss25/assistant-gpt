"use client";

import Link from "next/link";
import type { Item } from "@/lib/types";
import { CategoryBadge, Pill, ScoreRange, fmtMoney } from "./ui";

export function PisteCard({ item, college = false }: { item: Item; college?: boolean }) {
  const families = Array.from(new Set(item.occupations.map((o) => o.family))).slice(0, 5);
  const ap = item.admission_probability;
  return (
    <article className="fade-in flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start gap-2">
        <h3 className="flex-1 text-lg font-semibold leading-snug">{item.short}</h3>
        {!college && <CategoryBadge category={item.category} />}
        {item.exploratory && <Pill tone="amber">🧭 exploratoire</Pill>}
      </header>
      <ScoreRange low={item.fit_score.low} high={item.fit_score.high} label={item.fit_score.label} />
      {!college && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Admission estimée</dt>
          <dd>{ap.open_access ? "accès ouvert" : `${Math.round(ap.low * 100)}–${Math.round(ap.high * 100)} %`}</dd>
          <dt className="text-slate-500">Coût</dt>
          <dd>{fmtMoney(item.cost)}</dd>
          <dt className="text-slate-500">Durée</dt>
          <dd>{item.duration_years} an{item.duration_years > 1 ? "s" : ""}</dd>
          <dt className="text-slate-500">Villes</dt>
          <dd className="truncate" title={item.cities.join(", ")}>{item.cities.slice(0, 3).join(", ")}{item.cities.length > 3 ? "…" : ""}</dd>
        </dl>
      )}
      <div>
        <p className="text-sm font-medium">Pourquoi ça te correspond</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-slate-700">
          {item.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      {college && (
        <>
          <div>
            <p className="text-sm font-medium">Familles de métiers</p>
            <div className="mt-1 flex flex-wrap gap-1">{families.map((f) => <Pill key={f}>{f}</Pill>)}</div>
          </div>
          <div className="rounded-xl bg-violet-50 p-3 text-sm">
            <p className="font-medium text-violet-900">🤖 Ce que l&apos;IA change ({item.ai_impact.occupation_name})</p>
            <p className="mt-1">Automatisé : {item.ai_impact.automated[0] ?? "—"}</p>
            <p>Augmenté : {item.ai_impact.augmented[0] ?? "—"}</p>
            <p>Toujours humain : {item.ai_impact.human_core[0] ?? "—"}</p>
          </div>
        </>
      )}
      {item.flags.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-900">{item.flags.map((f) => <li key={f.message}>⚠️ {f.message}</li>)}</ul>
      )}
      <Link href={`/eleve/piste/${encodeURIComponent(item.program_id)}`} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-600 px-4 text-brand-700 hover:bg-brand-50">
        Voir le détail
      </Link>
    </article>
  );
}
