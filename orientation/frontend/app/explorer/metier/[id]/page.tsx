"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, Card, Loading, Notice, Pill } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Source } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface Occ {
  id: string; name: string; family: string; holland: string;
  tasks: { label: string; cat: "a" | "b" | "c"; share: number }[];
  outlook: { D: number; H: number; A: number; M: number; avenir: number; as_of: string; weights: Record<string, number>; transformation: { a: number; b: number; c: number } };
  programs: { id: string; short: string; system: string }[];
  sources: Source[]; referential_version: string; notice: string;
}
const CAT = { a: { label: "Automatisable", cls: "bg-slate-100" }, b: { label: "Augmentée par l'IA", cls: "bg-violet-100" }, c: { label: "Humaine à forte valeur", cls: "bg-emerald-100" } };

export default function OccupationPage() {
  const user = useSession();
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<Occ | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (user) api<Occ>(`/explorer/occupations/${id}`).then(setO).catch((e) => setError(errorMessage(e))); }, [user, id]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!o) return <Loading />;
  const w = o.outlook.weights;
  return (
    <div className="space-y-4">
      <Link href="/explorer" className="text-sm text-brand-700 underline">← Explorer</Link>
      <h1 className="text-2xl font-bold">{o.name}</h1>
      <p className="text-slate-600">{o.family}</p>
      <Notice tone="warn">{o.notice}</Notice>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Les tâches du métier à l&apos;ère de l&apos;IA</h2>
          <ul className="space-y-1">
            {o.tasks.map((t) => (
              <li key={t.label} className={`flex justify-between rounded-lg px-2 py-1 text-sm ${CAT[t.cat].cls}`}>
                <span>{t.label}</span><span className="text-xs">{CAT[t.cat].label} · {Math.round(t.share * 100)} %</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">On parle de transformation du métier, pas de « probabilité de disparition ».</p>
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">Indice Avenir +5 : {o.outlook.avenir.toString().replace(".", ",")} / 100</h2>
          <Bar label={`Demande à 5 ans (D, poids ${w.D})`} value={o.outlook.D} />
          <Bar label={`Tâches humaines ou augmentées (H, poids ${w.H})`} value={o.outlook.H} />
          <Bar label={`Accessibilité des formations au Maroc (A, poids ${w.A})`} value={o.outlook.A} />
          <Bar label={`Mobilité vers des métiers voisins (M, poids ${w.M})`} value={o.outlook.M} />
          <p className="text-xs text-slate-500">Au {new Date(o.outlook.as_of).toLocaleDateString("fr-FR")} · référentiel {o.referential_version}</p>
          <ul className="text-xs">{o.sources.map((s) => <li key={s.id}><Pill tone={s.reliability === "officielle" ? "green" : "amber"}>{s.reliability}</Pill> {s.title}</li>)}</ul>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Formations qui y mènent</h2>
        <ul className="flex flex-wrap gap-2">{o.programs.map((p) => <li key={p.id}><Link className="text-brand-700 underline" href={`/explorer/formation/${p.id}`}>{p.short}</Link> <span className="text-xs text-slate-500">({p.system})</span></li>)}</ul>
      </Card>
    </div>
  );
}
