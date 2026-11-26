"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, CategoryBadge, Field, Loading, Notice, Pill, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Category, Recommendation } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface FileData {
  display_name: string; class: string | null; level: string; stream: string | null; fr_specialties: string[];
  certainty_history: { at: string; value: number }[]; shared: Record<string, boolean>;
  traits?: { holland_code: string; riasec: Record<string, { value: number; se: number }> };
  grades?: Record<string, number[]>;
  runs?: { run_id: number; created_at: string; referential_version: string; items: { short: string; category: Category; fit_score: { low: number; high: number } }[] }[];
  latest?: Recommendation | null;
  evidence?: { id: number; title: string; type: string; verified: boolean }[];
  milestones?: { label: string; status: string }[];
  notes: { id: number; text: string; visibility: string; created_at: string; author: string }[];
  alerts: { id: number; type: string; message: string; status: string }[];
}
const VIS: Record<string, string> = { counselor: "Conseillers uniquement", student: "Visible par l'élève", parent: "Visible par l'élève et ses parents" };

export default function StudentFile() {
  const user = useSession(["counselor", "school_admin"]);
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<FileData | null>(null);
  const [note, setNote] = useState({ text: "", visibility: "counselor" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<FileData>(`/counselor/students/${id}`).then(setF).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!f) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <Link href="/conseiller" className="flex-1 text-sm text-brand-700 underline">← Cohorte</Link>
        <Button variant="secondary" onClick={() => window.print()}>Exporter en PDF (conseil de classe)</Button>
      </div>
      <header>
        <h1 className="text-2xl font-bold">Fiche de synthèse — {f.display_name}</h1>
        <p className="text-slate-600">{f.class} · {f.level}{f.stream ? ` · ${f.stream}` : ""}{f.fr_specialties.length ? ` · ${f.fr_specialties.join(" + ")}` : ""}</p>
        <p className="text-sm text-slate-500">Certitude du projet : {f.certainty_history.map((c) => c.value).join(" → ") || "—"} / 10</p>
      </header>
      {f.alerts.filter((a) => a.status !== "closed").map((a) => <Notice key={a.id} tone="warn">{a.message}</Notice>)}
      <div className="grid gap-4 md:grid-cols-2">
        {f.latest ? (
          <Card>
            <h2 className="mb-2 font-semibold">Pistes du dernier bilan</h2>
            <ul className="space-y-2 text-sm">
              {f.latest.items.map((i) => (
                <li key={i.program_id}>
                  <div className="flex items-center gap-2"><strong className="flex-1">{i.short}</strong>{i.type === "program" && <CategoryBadge category={i.category} />}</div>
                  <p className="text-slate-600">Adéquation {i.fit_score.low}–{i.fit_score.high} % · {i.reasons[0]}</p>
                  <p className="text-xs text-slate-500">{i.counterfactual}</p>
                </li>
              ))}
            </ul>
            {f.latest.signals.map((s) => <p key={s.message} className="mt-2 text-sm text-violet-800">💡 {s.message}</p>)}
            <p className="mt-2 text-xs text-slate-500">Bilan du {f.runs?.[0] ? new Date(f.runs[0].created_at).toLocaleDateString("fr-FR") : "—"} · référentiel {f.latest.referential_version} · modèle {f.latest.model_version}</p>
          </Card>
        ) : <Notice tone="info">{f.shared.pistes ? "Aucun bilan calculé." : "L'élève ne partage pas ses pistes."}</Notice>}
        <Card className="space-y-2">
          {f.traits && <p><strong>Profil d&apos;intérêts :</strong> {f.traits.holland_code}</p>}
          {f.grades && (
            <div className="text-sm">
              <strong>Moyennes</strong>
              <ul className="mt-1 grid grid-cols-2 gap-x-3">{Object.entries(f.grades).map(([s, v]) => <li key={s}>{s} : {v.join(" → ")}</li>)}</ul>
            </div>
          )}
          {f.milestones && <div className="text-sm"><strong>Feuille de route</strong><ul className="list-disc ps-5">{f.milestones.map((m) => <li key={m.label}>{m.label} {m.status === "done" && "✅"}</li>)}</ul></div>}
          {f.evidence && (
            <div className="text-sm">
              <strong>Preuves</strong>
              <ul className="space-y-1">
                {f.evidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="flex-1">{e.title}</span>
                    {e.verified ? <Pill tone="green">vérifiée</Pill> : <Button variant="ghost" className="no-print min-h-8 px-2 text-xs" onClick={async () => { await api(`/counselor/students/${id}/evidence/${e.id}/verify`, { body: {} }); load(); }}>Vérifier</Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!f.shared.grades && <p className="text-xs text-slate-500">Notes non partagées par l&apos;élève.</p>}
        </Card>
      </div>
      {f.runs && f.runs.length > 1 && (
        <Card>
          <h2 className="mb-2 font-semibold">Historique des bilans</h2>
          <ul className="space-y-1 text-sm">{f.runs.map((r) => <li key={r.run_id}>{new Date(r.created_at).toLocaleDateString("fr-FR")} ({r.referential_version}) : {r.items.slice(0, 3).map((i) => `${i.short} (${i.category})`).join(", ")}</li>)}</ul>
        </Card>
      )}
      <Card>
        <h2 className="mb-2 font-semibold">Notes d&apos;entretien</h2>
        <ul className="mb-3 space-y-2 text-sm">
          {f.notes.map((n) => <li key={n.id} className="rounded-lg bg-slate-50 p-2"><p>{n.text}</p><p className="text-xs text-slate-500">{n.author} · {new Date(n.created_at).toLocaleDateString("fr-FR")} · {VIS[n.visibility]}</p></li>)}
        </ul>
        <form className="no-print space-y-2" onSubmit={async (e) => { e.preventDefault(); await api(`/counselor/students/${id}/notes`, { body: note }); setNote({ text: "", visibility: "counselor" }); load(); }}>
          <Field label="Nouvelle note"><textarea className={inputCls} rows={3} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} required maxLength={5000} /></Field>
          <select className="rounded-xl border border-slate-300 p-2 text-sm" value={note.visibility} onChange={(e) => setNote({ ...note, visibility: e.target.value })} aria-label="Visibilité">
            {Object.entries(VIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>{" "}
          <Button type="submit">Enregistrer</Button>
        </form>
      </Card>
    </div>
  );
}
