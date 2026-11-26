"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CategoryBadge, Loading, Notice, ScoreRange } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Meta, Recommendation } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface Grade { subject: string; period: string; value: number }
const ORDER: Record<string, number> = { T1: 1, S1: 1, T2: 2, T3: 3, S2: 3 };

export default function Simulator() {
  const user = useSession(["student"]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [base, setBase] = useState<Record<string, number>>({});
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [budget, setBudget] = useState<string>("");
  const [mobility, setMobility] = useState<string>("");
  const [result, setResult] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Meta>("/meta/levels"), api<Grade[]>("/students/me/grades"), api<Recommendation>("/students/me/recommendations/latest")])
      .then(([m, g, r]) => {
        setMeta(m);
        const latest: Record<string, number> = {};
        for (const x of [...g].sort((a, b) => (ORDER[a.period] ?? 2) - (ORDER[b.period] ?? 2))) latest[x.subject] = x.value;
        setBase(latest);
        setGrades(latest);
        setResult(r);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  function schedule(nextGrades: Record<string, number>, nextBudget = budget, nextMobility = mobility) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const overrides = Object.fromEntries(Object.entries(nextGrades).filter(([s, v]) => v !== base[s]));
        setResult(await api<Recommendation>("/students/me/simulate", {
          body: { grades: overrides, budget_annual_mad: nextBudget === "" ? null : Number(nextBudget), mobility: nextMobility || null },
        }));
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  if (!user) return null;
  if (!meta || !result) return error ? <Notice tone="error">{error}</Notice> : <Loading />;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="space-y-4 md:sticky md:top-28 md:self-start">
        <h1 className="text-xl font-bold">Et si… ?</h1>
        <p className="text-sm text-slate-600">Bouge les curseurs : tes pistes sont recalculées instantanément. Tes vraies notes ne sont pas modifiées.</p>
        {Object.keys(base).map((s) => (
          <label key={s} className="block">
            <span className="flex justify-between text-sm"><span>{meta.subjects[s]}</span><strong>{grades[s]?.toFixed(1).replace(".", ",")} / 20</strong></span>
            <input type="range" min={0} max={20} step={0.5} value={grades[s]} className="w-full"
              onChange={(e) => { const g = { ...grades, [s]: Number(e.target.value) }; setGrades(g); schedule(g); }} />
          </label>
        ))}
        <label className="block text-sm">Budget annuel
          <select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={budget} onChange={(e) => { setBudget(e.target.value); schedule(grades, e.target.value); }}>
            <option value="">Comme mon profil</option>
            <option value="0">Public gratuit uniquement</option>
            <option value="5000">5 000 MAD</option>
            <option value="20000">20 000 MAD</option>
            <option value="80000">80 000 MAD</option>
          </select>
        </label>
        <label className="block text-sm">Mobilité
          <select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={mobility} onChange={(e) => { setMobility(e.target.value); schedule(grades, budget, e.target.value); }}>
            <option value="">Comme mon profil</option>
            <option value="local">Rester dans ma ville</option>
            <option value="national">Partout au Maroc</option>
            <option value="international">À l&apos;étranger aussi</option>
          </select>
        </label>
      </Card>
      <div className="space-y-3" aria-live="polite" aria-busy={loading}>
        {error && <Notice tone="error">{error}</Notice>}
        {result.changes && result.changes.length > 0 && (
          <Card className="fade-in border-brand-200 bg-brand-50">
            <h2 className="font-semibold">Ce qui change</h2>
            <ul className="mt-1 list-disc ps-5 text-sm">{result.changes.map((c) => <li key={c.program_id}>{c.explanation}</li>)}</ul>
          </Card>
        )}
        {result.items.map((i) => (
          <div key={i.program_id} className="fade-in rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-start gap-2">
              <p className="flex-1 font-medium">{i.short}</p>
              {i.type === "program" && <CategoryBadge category={i.category} />}
            </div>
            <ScoreRange low={i.fit_score.low} high={i.fit_score.high} label={i.fit_score.label} />
            {!i.admission_probability.open_access && i.type === "program" && (
              <p className="mt-1 text-xs text-slate-600">Admission estimée : {Math.round(i.admission_probability.low * 100)}–{Math.round(i.admission_probability.high * 100)} %</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
