"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, CategoryBadge, Loading, Notice, Pill, Tabs } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Category } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface Cohort {
  kpis: { students: number; completion_rate: number; undecided: number; open_alerts: number; certainty_first_avg: number | null; certainty_last_avg: number | null };
  sector_distribution: { sector: string; label: string; count: number }[];
  heatmap: { rows: string[]; columns: string[]; values: Record<string, Record<string, number>> };
  students: { student_id: number; display_name: string; class: string | null; level: string; completed: boolean; certainty: number | null; open_alerts: number; pistes_shared: boolean; top: { short: string; category: Category }[] }[];
}
interface AlertRow { id: number; student_id: number; display_name: string; type: string; priority: number; message: string; suggested_action: string; status: string; data: Record<string, unknown> }
interface Workshop { labels: string[]; students: number; suggestion: string }
const ALERT_LABELS: Record<string, string> = { autocensure: "Autocensure probable", indecision: "Indécision persistante", ecart_ambition: "Écart ambitions / résultats", motivation: "Baisse de motivation", sans_preuve: "Aucune preuve depuis 60 jours" };

export default function CounselorHome() {
  const user = useSession(["counselor", "school_admin"]);
  const [tab, setTab] = useState("cohorte");
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [filters, setFilters] = useState({ class_id: "", gender: "" });
  const [error, setError] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    Promise.all([
      api<Cohort>(`/counselor/cohort?${qs}`), api<AlertRow[]>("/counselor/alerts"), api<Workshop[]>("/counselor/workshops"), api<{ id: number; name: string }[]>("/counselor/classes"),
    ])
      .then(([c, a, w, cl]) => { if (alive) { setCohort(c); setAlerts(a); setWorkshops(w); setClasses(cl); } })
      .catch((e) => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [user, filters, reload]);

  async function setStatus(a: AlertRow, status: string) {
    await api(`/counselor/alerts/${a.id}`, { method: "PATCH", body: { status } });
    setAlerts(alerts.map((x) => (x.id === a.id ? { ...x, status } : x)).filter((x) => x.status !== "closed"));
  }

  if (!user) return null;
  if (!cohort) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const k = cohort.kpis;
  const maxHeat = Math.max(1, ...Object.values(cohort.heatmap.values).flatMap((r) => Object.values(r)));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tableau de bord d&apos;orientation</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Élèves", k.students], ["Évaluation complétée", `${Math.round(k.completion_rate * 100)} %`], ["Indécis (≤ 3/10)", k.undecided], ["Alertes ouvertes", k.open_alerts]].map(([l, v]) => (
          <Card key={l as string}><p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-bold">{v}</p></Card>
        ))}
      </div>
      {k.certainty_first_avg !== null && <p className="text-sm text-slate-600">Certitude moyenne du projet : {k.certainty_first_avg} → {k.certainty_last_avg} / 10</p>}
      <Tabs tabs={[{ id: "cohorte", label: "Cohorte" }, { id: "alertes", label: `Alertes (${alerts.length})` }, { id: "ateliers", label: "Ateliers" }]} active={tab} onChange={setTab} />
      {tab === "cohorte" && (
        <>
          <div className="flex flex-wrap gap-2">
            <select className="rounded-xl border border-slate-300 p-2" value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })} aria-label="Classe">
              <option value="">Toutes les classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="rounded-xl border border-slate-300 p-2" value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })} aria-label="Genre">
              <option value="">Filles et garçons</option><option value="F">Filles</option><option value="M">Garçons</option>
            </select>
          </div>
          {cohort.heatmap.rows.length > 0 && (
            <Card className="overflow-x-auto">
              <h2 className="mb-2 font-semibold">Carte de chaleur : classe × famille de la piste n° 1</h2>
              <table className="text-sm">
                <thead><tr><th />{cohort.heatmap.columns.map((c) => <th key={c} className="px-2 text-xs font-medium">{cohort.sector_distribution.find((s) => s.sector === c)?.label ?? c}</th>)}</tr></thead>
                <tbody>
                  {cohort.heatmap.rows.map((r) => (
                    <tr key={r}>
                      <th className="pe-2 text-start font-medium">{r}</th>
                      {cohort.heatmap.columns.map((c) => {
                        const v = cohort.heatmap.values[r]?.[c] ?? 0;
                        return <td key={c} className="h-9 w-16 text-center" style={{ background: v ? `rgba(29,78,216,${0.15 + 0.7 * (v / maxHeat)})` : "#f1f5f9", color: v / maxHeat > 0.5 ? "white" : undefined }}>{v || ""}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-slate-500"><tr><th className="text-start">Élève</th><th className="text-start">Classe</th><th>Évaluation</th><th>Certitude</th><th className="text-start">Pistes principales</th><th>Alertes</th></tr></thead>
              <tbody>
                {cohort.students.map((s) => (
                  <tr key={s.student_id} className="border-t border-slate-100">
                    <td className="py-2"><Link className="text-brand-700 underline" href={`/conseiller/eleve/${s.student_id}`}>{s.display_name}</Link></td>
                    <td>{s.class}</td>
                    <td className="text-center">{s.completed ? "✅" : "—"}</td>
                    <td className="text-center">{s.certainty ?? "—"}</td>
                    <td>{s.pistes_shared ? <div className="flex flex-wrap gap-1">{s.top.map((t) => <span key={t.short} className="inline-flex items-center gap-1 text-xs">{t.short} <CategoryBadge category={t.category} /></span>)}</div> : <span className="text-xs text-slate-400">non partagé</span>}</td>
                    <td className="text-center">{s.open_alerts > 0 ? <Pill tone="red">{s.open_alerts}</Pill> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      {tab === "alertes" && (
        <div className="space-y-2">
          <Button variant="ghost" onClick={async () => { await api("/counselor/refresh-alerts", { body: {} }); setReload((n) => n + 1); }}>↻ Recalculer les alertes</Button>
          {alerts.length === 0 && <Notice tone="success">Aucune alerte ouverte.</Notice>}
          {alerts.map((a) => (
            <Card key={a.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={a.priority === 1 ? "red" : a.priority === 2 ? "amber" : "slate"}>Priorité {a.priority}</Pill>
                <strong>{ALERT_LABELS[a.type] ?? a.type}</strong> — <Link className="text-brand-700 underline" href={`/conseiller/eleve/${a.student_id}`}>{a.display_name}</Link>
                {a.status === "in_progress" && <Pill tone="violet">en cours</Pill>}
              </div>
              <p className="text-sm">{a.message}</p>
              <p className="text-sm text-slate-600">Action suggérée : {a.suggested_action}</p>
              <div className="flex gap-2">
                {a.status === "open" && <Button variant="secondary" className="min-h-9 text-sm" onClick={() => setStatus(a, "in_progress")}>Je m&apos;en occupe</Button>}
                <Button variant="ghost" className="min-h-9 text-sm" onClick={() => setStatus(a, "closed")}>Clore</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "ateliers" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Besoins agrégés : élèves dont les deux premières pistes relèvent de familles différentes avec des scores proches.</p>
          {workshops.length === 0 && <Notice tone="info">Pas de besoin collectif détecté pour l&apos;instant.</Notice>}
          {workshops.map((w) => (
            <Card key={w.labels.join()}>
              <p><strong>{w.students} élève{w.students > 1 ? "s" : ""}</strong> hésitent entre {w.labels.join(" et ")}.</p>
              <p className="text-sm text-slate-600">{w.suggestion}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
