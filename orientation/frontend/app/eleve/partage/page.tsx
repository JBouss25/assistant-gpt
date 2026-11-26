"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Notice, Pill, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/useSession";

interface ConsentState { granted: boolean; scopes: string[]; granted_at: string | null }
interface Consents {
  student_terms: ConsentState; parent_legal: ConsentState; share_parent: ConsentState; share_counselor: ConsentState;
  parental_consent_required: boolean; guardians: { status: string; contact: string | null; invite_code: string | null }[]; available_scopes: string[];
}
const SCOPE_LABELS: Record<string, string> = {
  profile: "Mon profil (classe, filière)", pistes: "Mes pistes et mon bilan", roadmap: "Ma feuille de route", evidence: "Mon carnet de preuves",
  grades: "Mes notes", assessment: "Mes résultats d'évaluation (intérêts, valeurs)", notes: "Notes d'entretien",
};

export default function Sharing() {
  const user = useSession(["student"]);
  const [c, setC] = useState<Consents | null>(null);
  const [contact, setContact] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Consents>("/students/me/consents").then(setC).catch((e) => setError(errorMessage(e)));
  useEffect(() => { if (user) load(); }, [user]);

  async function setScopes(kind: "share_parent" | "share_counselor", scopes: string[]) {
    try {
      if (scopes.length === 0) await api(`/students/me/consents/${kind}`, { method: "DELETE" });
      else await api("/students/me/consents", { body: { kind, scopes } });
      setMsg("Préférences de partage enregistrées. Elles s'appliquent immédiatement.");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!user || !c) return null;
  const block = (kind: "share_parent" | "share_counselor", title: string, scopes: string[]) => (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <ul className="space-y-2">
        {scopes.map((s) => {
          const on = c[kind].scopes.includes(s);
          return (
            <li key={s}>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={on} onChange={() => setScopes(kind, on ? c[kind].scopes.filter((x) => x !== s) : [...c[kind].scopes, s])} />
                <span>{SCOPE_LABELS[s]}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {c[kind].granted && <Button variant="ghost" className="mt-2" onClick={() => setScopes(kind, [])}>Tout retirer</Button>}
    </Card>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ce que je partage</h1>
      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Card>
        <h2 className="text-lg font-semibold">Validation parentale</h2>
        <p className="text-sm text-slate-600">Pour un mineur, un parent ou représentant légal doit valider l&apos;inscription. Il ne voit pourtant que ce que tu choisis de partager.</p>
        <p className="mt-2">{c.parent_legal.granted ? <Pill tone="green">Validée ✓</Pill> : <Pill tone="amber">En attente</Pill>}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {c.guardians.map((g, i) => (
            <li key={i}>{g.contact ?? "Parent"} — {g.status === "active" ? "compte relié" : "invitation envoyée"}
              {g.invite_code && <> · <span className="text-slate-500">code (démo) :</span> <code className="font-mono">{g.invite_code}</code></>}</li>
          ))}
        </ul>
        <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api("/students/me/parent-invite", { body: { contact } }); setContact(""); await load(); } catch (err) { setError(errorMessage(err)); } }}>
          <input className={inputCls} placeholder="Téléphone ou e-mail du parent" value={contact} onChange={(e) => setContact(e.target.value)} aria-label="Contact du parent" minLength={3} required />
          <Button type="submit">Inviter</Button>
        </form>
      </Card>
      {block("share_parent", "Avec mes parents", ["profile", "pistes", "roadmap", "evidence", "assessment"])}
      {block("share_counselor", "Avec mon conseiller d'orientation", ["profile", "pistes", "roadmap", "evidence", "grades", "assessment"])}
      <Field label="Bon à savoir">
        <p className="text-sm text-slate-600">Le conseiller voit toujours que tu es inscrit·e et ton taux de complétion (suivi de cohorte). Tes données ne sont jamais vendues ni utilisées pour entraîner des IA.</p>
      </Field>
    </div>
  );
}
