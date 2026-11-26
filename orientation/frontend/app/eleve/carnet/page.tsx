"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Notice, Pill, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface Evidence { id: number; title: string; type: string; domains: string[]; description: string | null; verified: boolean; created_at: string }
interface Milestone { id: number; label: string; status: "todo" | "doing" | "done"; due_date: string | null }
const TYPES: Record<string, string> = { projet: "Projet", stage: "Stage", mooc: "MOOC terminé", club: "Club", concours: "Concours", benevolat: "Bénévolat", declaratif: "Intérêt déclaré" };

export default function Notebook() {
  const user = useSession(["student"]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [form, setForm] = useState({ title: "", type: "projet", domains: [] as string[], description: "" });
  const [newMilestone, setNewMilestone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Meta>("/meta/levels"), api<Evidence[]>("/students/me/evidence"), api<Milestone[]>("/students/me/milestones")])
      .then(([m, e, ms]) => { setMeta(m); setEvidence(e); setMilestones(ms); })
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  async function addEvidence(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await api<Evidence>("/students/me/evidence", { body: { ...form, description: form.description || null } });
      setEvidence([created, ...evidence]);
      setForm({ title: "", type: "projet", domains: [], description: "" });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function setStatus(m: Milestone, status: Milestone["status"]) {
    const u = await api<Milestone>(`/students/me/milestones/${m.id}`, { method: "PATCH", body: { label: m.label, status, due_date: m.due_date } });
    setMilestones(milestones.map((x) => (x.id === m.id ? u : x)));
  }

  if (!user || !meta) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Mon carnet de preuves</h1>
        <p className="text-sm text-slate-600">Un intérêt démontré (projet, stage, MOOC…) compte plus qu&apos;un intérêt déclaré. Les preuves vérifiées par ton établissement comptent double.</p>
        <Card>
          <form onSubmit={addEvidence} className="space-y-3">
            <Field label="Titre"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} maxLength={200} /></Field>
            <Field label="Type">
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Domaines concernés</legend>
              <div className="flex flex-wrap gap-1">
                {Object.entries(meta.domains).map(([k, l]) => {
                  const on = form.domains.includes(k);
                  return <button type="button" key={k} aria-pressed={on} onClick={() => setForm({ ...form, domains: on ? form.domains.filter((d) => d !== k) : [...form.domains, k] })}
                    className={`rounded-full border px-2 py-0.5 text-sm ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>{l}</button>;
                })}
              </div>
            </fieldset>
            <Field label="Description (facultatif)"><textarea className={inputCls} rows={3} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Button type="submit">Ajouter la preuve</Button>
          </form>
        </Card>
        {error && <Notice tone="error">{error}</Notice>}
        <ul className="space-y-2">
          {evidence.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="flex-1">{e.title}</strong>
                <Pill>{TYPES[e.type] ?? e.type}</Pill>
                {e.verified ? <Pill tone="green">vérifiée ✓</Pill> : <Pill tone="amber">à vérifier</Pill>}
              </div>
              <p className="text-xs text-slate-500">{e.domains.map((d) => meta.domains[d]).join(", ")} · {new Date(e.created_at).toLocaleDateString("fr-FR")}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-bold">Ma feuille de route (6–12 mois)</h2>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!newMilestone.trim()) return; const m = await api<Milestone>("/students/me/milestones", { body: { label: newMilestone } }); setMilestones([...milestones, m]); setNewMilestone(""); }}>
          <input className={inputCls} placeholder="Nouvel objectif mesurable" value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} aria-label="Nouvel objectif" />
          <Button type="submit">Ajouter</Button>
        </form>
        {(["todo", "doing", "done"] as const).map((st) => (
          <Card key={st}>
            <h3 className="mb-2 font-semibold">{{ todo: "À faire", doing: "En cours", done: "Atteint 🎯" }[st]}</h3>
            <ul className="space-y-2">
              {milestones.filter((m) => m.status === st).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1">{m.label}</span>
                  <select aria-label="Statut" value={m.status} onChange={(e) => setStatus(m, e.target.value as Milestone["status"])} className="rounded-lg border border-slate-300 px-1 py-0.5">
                    <option value="todo">À faire</option><option value="doing">En cours</option><option value="done">Atteint</option>
                  </select>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
