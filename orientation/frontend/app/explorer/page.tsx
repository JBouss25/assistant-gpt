"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Pill, Tabs, inputCls } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

interface OccCard { id: string; name: string; family: string; sector: string; avenir: number; transformation: { a: number; b: number; c: number } }
interface PrgCard { id: string; name: string; short: string; type: string; system: string; selective: boolean; avenir: number | null; duration_years: number }

export default function Explorer() {
  const user = useSession();
  const [tab, setTab] = useState("metiers");
  const [q, setQ] = useState("");
  const [occ, setOcc] = useState<OccCard[]>([]);
  const [prg, setPrg] = useState<PrgCard[]>([]);
  const [system, setSystem] = useState("");

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q });
      if (tab === "metiers") api<{ items: OccCard[] }>(`/explorer/occupations?${qs}`).then((r) => setOcc(r.items)).catch(() => undefined);
      else {
        if (system) qs.set("system", system);
        api<{ items: PrgCard[] }>(`/explorer/programs?${qs}`).then((r) => setPrg(r.items.filter((p) => p.type !== "bridge"))).catch(() => undefined);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [user, q, tab, system]);

  if (!user) return null;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Explorer les métiers et les formations</h1>
      <Tabs tabs={[{ id: "metiers", label: "Métiers" }, { id: "formations", label: "Formations et voies" }]} active={tab} onChange={setTab} />
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        {tab === "formations" && (
          <select className="rounded-xl border border-slate-300 px-2" value={system} onChange={(e) => setSystem(e.target.value)} aria-label="Système">
            <option value="">Tous</option><option value="MA">Maroc</option><option value="FR">France</option>
          </select>
        )}
      </div>
      {tab === "metiers" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {occ.map((o) => (
            <Link key={o.id} href={`/explorer/metier/${o.id}`}>
              <Card className="h-full hover:border-brand-500">
                <p className="font-semibold">{o.name}</p>
                <p className="text-xs text-slate-500">{o.family}</p>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-slate-400" style={{ width: `${o.transformation.a * 100}%` }} />
                  <div className="bg-violet-500" style={{ width: `${o.transformation.b * 100}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${o.transformation.c * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {Math.round(o.transformation.a * 100)} % automatisable · {Math.round(o.transformation.b * 100)} % augmenté · {Math.round(o.transformation.c * 100)} % humain · Avenir +5 : {o.avenir.toString().replace(".", ",")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {prg.map((p) => (
            <Link key={p.id} href={`/explorer/formation/${p.id}`}>
              <Card className="h-full hover:border-brand-500">
                <p className="font-semibold">{p.short}</p>
                <p className="text-xs text-slate-500">{p.name}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Pill>{p.system === "MA" ? "Maroc" : "France"}</Pill>
                  <Pill>{p.type === "track" ? "voie du secondaire" : "post-bac"}</Pill>
                  {p.selective && <Pill tone="violet">sélective</Pill>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
