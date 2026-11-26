"use client";

import { useEffect, useState } from "react";
import { Button, Card, CategoryBadge, Loading, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Category, Item, Recommendation } from "@/lib/types";
import { useSession } from "@/lib/useSession";

type Columns = Record<Category, string[]>;
const COLS: { id: Category; title: string; hint: string }[] = [
  { id: "A", title: "A · Ambition", hint: "Des vœux exigeants qui te font envie." },
  { id: "B", title: "B · Cible réaliste", hint: "Ce qui correspond à ton dossier actuel." },
  { id: "C", title: "C · Sécurité", hint: "Une voie sûre, avec des passerelles pour remonter." },
];

export default function Wishlist() {
  const user = useSession(["student"]);
  const [reco, setReco] = useState<Recommendation | null>(null);
  const [cols, setCols] = useState<Columns>({ A: [], B: [], C: [] });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Recommendation>("/students/me/recommendations/latest"), api<{ columns: Columns; warnings: string[] }>("/students/me/wishlist")])
      .then(([r, w]) => {
        setReco(r);
        setCols({ A: w.columns.A ?? [], B: w.columns.B ?? [], C: w.columns.C ?? [] });
        setWarnings(w.warnings);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  async function save(next: Columns) {
    setCols(next);
    try {
      const r = await api<{ warnings: string[] }>("/students/me/wishlist", { method: "PUT", body: next });
      setWarnings(r.warnings);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function moveTo(pid: string, target: Category | null) {
    const next: Columns = { A: cols.A.filter((x) => x !== pid), B: cols.B.filter((x) => x !== pid), C: cols.C.filter((x) => x !== pid) };
    if (target) next[target] = [...next[target], pid];
    save(next);
  }

  if (!user) return null;
  if (!reco) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const byId: Record<string, Item> = Object.fromEntries(reco.items.map((i) => [i.program_id, i]));
  const placed = new Set([...cols.A, ...cols.B, ...cols.C]);
  const pool = reco.items.filter((i) => i.type === "program" && !placed.has(i.program_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold">Mon constructeur de vœux</h1>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>Exporter en PDF</Button>
      </div>
      {warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      {warnings.length === 0 && placed.size > 0 && <Notice tone="success">Ta liste est équilibrée entre ambition, réalisme et sécurité.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {pool.length > 0 && (
        <Card className="no-print">
          <h2 className="mb-2 font-semibold">Mes pistes à placer</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {pool.map((i) => (
              <li key={i.program_id} draggable onDragStart={() => setDrag(i.program_id)} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
                <span className="flex-1 text-sm font-medium">{i.short}</span>
                <CategoryBadge category={i.category} />
                <div className="flex gap-1">{COLS.map((c) => <button key={c.id} onClick={() => moveTo(i.program_id, c.id)} className="rounded-lg border px-2 text-sm" aria-label={`Placer ${i.short} en ${c.id}`}>{c.id}</button>)}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {COLS.map((c) => (
          <section key={c.id} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && moveTo(drag, c.id)} className="min-h-40 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-3">
            <h2 className="font-semibold">{c.title}</h2>
            <p className="mb-2 text-xs text-slate-500">{c.hint}</p>
            <ol className="space-y-2">
              {cols[c.id].map((pid) => {
                const i = byId[pid];
                return (
                  <li key={pid} draggable onDragStart={() => setDrag(pid)} className="rounded-xl bg-slate-50 p-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 font-medium">{i?.short ?? pid}</span>
                      <button className="no-print text-slate-500" onClick={() => moveTo(pid, null)} aria-label="Retirer">✕</button>
                    </div>
                    {i && i.category !== c.id && <p className="mt-1 text-xs text-amber-800">Le moteur la classe plutôt en {i.category}.</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <p className="text-sm italic text-slate-600">{reco.disclaimer}</p>
    </div>
  );
}
