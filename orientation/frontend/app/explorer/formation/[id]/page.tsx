"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, Loading, Notice, Pill, fmtMoney } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Source } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface Mini { id: string; short?: string; name: string }
interface Prg {
  id: string; name: string; short: string; type: string; system: string; prerequisites: string[]; duration_years?: number; cities?: string[];
  admission: { threshold: number; selective: boolean; exam?: string; as_of: string; year: number } | null;
  cost: { annual_min: number; annual_max: number; currency: string; note?: string } | null;
  occupations_details: Mini[]; bridges_details: Mini[]; leads_to_details: Mini[];
  sources: Source[]; notice: string; referential_version: string;
}

export default function ProgramPage() {
  const user = useSession();
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Prg | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (user) api<Prg>(`/explorer/programs/${id}`).then(setP).catch((e) => setError(errorMessage(e))); }, [user, id]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!p) return <Loading />;
  return (
    <div className="space-y-4">
      <Link href="/explorer" className="text-sm text-brand-700 underline">← Explorer</Link>
      <h1 className="text-2xl font-bold">{p.name}</h1>
      <div className="flex flex-wrap gap-1">
        <Pill>{p.system === "MA" ? "Maroc" : "France"}</Pill>
        {p.admission?.selective && <Pill tone="violet">sélective</Pill>}
        {p.type === "bridge" && <Pill tone="green">passerelle</Pill>}
      </div>
      <Notice tone="warn">{p.notice}</Notice>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-1 text-sm">
          <h2 className="font-semibold">Infos pratiques</h2>
          <ul className="list-disc ps-5">{p.prerequisites.map((x) => <li key={x}>{x}</li>)}</ul>
          {p.admission && <p>Sélection : {p.admission.exam ?? "dossier"} · seuil de référence {p.admission.threshold.toString().replace(".", ",")} / 20 ({p.admission.year}, au {new Date(p.admission.as_of).toLocaleDateString("fr-FR")})</p>}
          {!p.admission && p.type !== "bridge" && <p>Accès ouvert</p>}
          <p>Coût : {fmtMoney(p.cost)}{p.cost?.note ? ` (${p.cost.note})` : ""}</p>
          {p.duration_years && <p>Durée : {p.duration_years} an(s)</p>}
          {p.cities && p.cities.length > 0 && <p>Villes : {p.cities.join(", ")}</p>}
          <ul className="pt-1 text-xs">{p.sources.map((s) => <li key={s.id}><Pill tone={s.reliability === "demo" ? "amber" : "green"}>{s.reliability}</Pill> {s.title}</li>)}</ul>
        </Card>
        <Card className="space-y-2 text-sm">
          <h2 className="font-semibold">Où ça mène</h2>
          <p className="font-medium">Métiers</p>
          <ul className="list-disc ps-5">{p.occupations_details.map((o) => <li key={o.id}><Link className="text-brand-700 underline" href={`/explorer/metier/${o.id}`}>{o.name}</Link></li>)}</ul>
          {p.leads_to_details.length > 0 && (<><p className="font-medium">Suites d&apos;études</p><ul className="list-disc ps-5">{p.leads_to_details.map((o) => <li key={o.id}><Link className="text-brand-700 underline" href={`/explorer/formation/${o.id}`}>{o.short ?? o.name}</Link></li>)}</ul></>)}
          {p.bridges_details.length > 0 && (<><p className="font-medium">Passerelles</p><ul className="list-disc ps-5">{p.bridges_details.map((o) => <li key={o.id}><Link className="text-brand-700 underline" href={`/explorer/formation/${o.id}`}>{o.name}</Link></li>)}</ul></>)}
        </Card>
      </div>
    </div>
  );
}
