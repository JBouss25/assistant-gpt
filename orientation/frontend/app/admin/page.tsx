"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Field, Loading, Notice, Tabs, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/useSession";

interface Stats { k: number; groups: { group: string; suppressed?: boolean; reason?: string; n?: number; completion_rate?: number; selective_science_rate?: number | null }[] }
interface AuditRow { at: string; actor_role: string | null; action: string; target: string | null }
const SAMPLE = "email;display_name;class_name;level;system;gender\nnouvel.eleve@demo.ma;Nadia;2BAC PC 1;MA_2BAC;MA;F";

export default function AdminHome() {
  const user = useSession(["school_admin"]);
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [csv, setCsv] = useState(SAMPLE);
  const [importResult, setImportResult] = useState<{ created: { email: string; temporary_password: string }[]; errors: { line: number; error: string }[] } | null>(null);
  const [staff, setStaff] = useState({ email: "", display_name: "", role: "counselor" });
  const [staffResult, setStaffResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Stats>("/admin/stats"), api<AuditRow[]>("/admin/audit?limit=50")]).then(([s, a]) => { setStats(s); setAudit(a); }).catch((e) => setError(errorMessage(e)));
  }, [user]);

  if (!user) return null;
  if (!stats) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold">Direction de l&apos;établissement</h1>
        <Link href="/conseiller" className="text-brand-700 underline">Tableau de bord de cohorte →</Link>
      </div>
      <Tabs tabs={[{ id: "stats", label: "Statistiques anonymisées" }, { id: "import", label: "Import des élèves" }, { id: "staff", label: "Équipe" }, { id: "audit", label: "Journal d'audit" }]} active={tab} onChange={setTab} />
      {error && <Notice tone="error">{error}</Notice>}
      {tab === "stats" && (
        <Card className="overflow-x-auto">
          <p className="mb-2 text-sm text-slate-600">Tout groupe de moins de {stats.k} élèves est masqué pour éviter la ré-identification.</p>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500"><th className="text-start">Groupe</th><th>Effectif</th><th>Complétion</th><th>Part de pistes scientifiques sélectives</th></tr></thead>
            <tbody>
              {stats.groups.map((g) => (
                <tr key={g.group} className="border-t border-slate-100">
                  <td className="py-1">{g.group.replace("niveau:", "Niveau ").replace("genre:", "Genre ")}</td>
                  {g.suppressed ? <td colSpan={3} className="text-center text-slate-400">masqué ({g.reason})</td> : (
                    <><td className="text-center">{g.n}</td><td className="text-center">{Math.round((g.completion_rate ?? 0) * 100)} %</td><td className="text-center">{g.selective_science_rate === null || g.selective_science_rate === undefined ? "—" : `${Math.round(g.selective_science_rate * 100)} %`}</td></>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {tab === "import" && (
        <Card className="space-y-3">
          <Field label="Fichier CSV (séparateur « ; »)" hint="Colonnes : email;display_name;class_name;level;system;gender (genre facultatif, utilisé uniquement pour les audits d'équité)">
            <textarea className={`${inputCls} font-mono text-xs`} rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
          </Field>
          <input type="file" accept=".csv,text/csv" aria-label="Choisir un fichier CSV" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} />
          <Button onClick={async () => { try { setImportResult(await api("/admin/students/import", { text: csv })); } catch (err) { setError(errorMessage(err)); } }}>Importer</Button>
          {importResult && (
            <div className="text-sm">
              <p>{importResult.created.length} compte(s) créé(s). Mots de passe provisoires (affichés une seule fois) :</p>
              <ul className="font-mono text-xs">{importResult.created.map((c) => <li key={c.email}>{c.email} — {c.temporary_password}</li>)}</ul>
              {importResult.errors.map((er) => <p key={er.line} className="text-red-700">Ligne {er.line} : {er.error}</p>)}
            </div>
          )}
        </Card>
      )}
      {tab === "staff" && (
        <Card>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { const r = await api<{ email: string; temporary_password: string }>("/admin/staff", { body: staff }); setStaffResult(`${r.email} — mot de passe provisoire : ${r.temporary_password}`); } catch (err) { setError(errorMessage(err)); } }}>
            <Field label="E-mail"><input className={inputCls} type="email" value={staff.email} onChange={(e) => setStaff({ ...staff, email: e.target.value })} required /></Field>
            <Field label="Nom"><input className={inputCls} value={staff.display_name} onChange={(e) => setStaff({ ...staff, display_name: e.target.value })} required /></Field>
            <Field label="Rôle">
              <select className={inputCls} value={staff.role} onChange={(e) => setStaff({ ...staff, role: e.target.value })}>
                <option value="counselor">Conseiller d&apos;orientation</option><option value="school_admin">Administrateur d&apos;établissement</option>
              </select>
            </Field>
            <Button type="submit">Créer le compte</Button>
            {staffResult && <Notice tone="success">{staffResult}</Notice>}
          </form>
        </Card>
      )}
      {tab === "audit" && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500"><th className="text-start">Date</th><th className="text-start">Rôle</th><th className="text-start">Action</th><th className="text-start">Cible</th></tr></thead>
            <tbody>{audit.map((a, i) => <tr key={i} className="border-t border-slate-100"><td className="py-1">{new Date(a.at).toLocaleString("fr-FR")}</td><td>{a.actor_role ?? "—"}</td><td>{a.action}</td><td>{a.target ?? ""}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
