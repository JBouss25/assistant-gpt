"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Loading, Notice, Pill, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/useSession";

interface Version { version: string; status: string; created_at: string; counts: { occupations: number; programs: number }; history: { at: string; to: string; comment?: string }[] }
interface VersionFull extends Version { content: { occupations: { id: string; name: string }[]; programs: { id: string; short: string }[]; meta: { notice: string } }; validation_errors: string[] }
const STATUS_TONE: Record<string, "slate" | "amber" | "violet" | "green" | "red"> = { draft: "amber", review: "violet", validated: "green", published: "green", archived: "slate" };
const NEXT: Record<string, { to: string; label: string; role: string }[]> = {
  draft: [{ to: "review", label: "Envoyer en relecture", role: "editor" }],
  review: [{ to: "validated", label: "Valider (comité)", role: "committee" }, { to: "draft_rejected", label: "Renvoyer en brouillon", role: "committee" }, { to: "draft", label: "Reprendre le brouillon", role: "editor" }],
  validated: [{ to: "published", label: "Publier", role: "committee" }],
};

export default function Backoffice() {
  const user = useSession(["editor", "committee"]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState<VersionFull | null>(null);
  const [newVersion, setNewVersion] = useState("2027.2");
  const [collection, setCollection] = useState<"occupations" | "programs">("occupations");
  const [itemId, setItemId] = useState("");
  const [json, setJson] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const vs = await api<Version[]>("/referential/versions");
      const target = selected ?? vs[0]?.version;
      const full = target ? await api<VersionFull>(`/referential/versions/${target}`) : null;
      if (alive) { setVersions(vs); setCurrent(full); }
    })().catch((e) => { if (alive) setMsg({ tone: "error", text: errorMessage(e) }); });
    return () => { alive = false; };
  }, [user, selected, reload]);
  const load = (select?: string) => { if (select) setSelected(select); setReload((n) => n + 1); };

  async function act(fn: () => Promise<unknown>, ok: string, select?: string) {
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
      load(select);
    } catch (e) {
      setMsg({ tone: "error", text: errorMessage(e) });
    }
  }

  function openItem(id: string) {
    if (!current) return;
    setItemId(id);
    const list = current.content[collection] as { id: string }[];
    setJson(JSON.stringify(list.find((x) => x.id === id), null, 2));
  }

  if (!user) return null;
  if (!current) return <Loading />;
  const editable = current.status === "draft" && user.role === "editor";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Back-office du référentiel</h1>
      <p className="text-sm text-slate-600">Workflow : rédaction → relecture → validation du comité scientifique → publication versionnée (sans redéploiement). Chaque recommandation garde la version utilisée.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="space-y-2">
          <h2 className="font-semibold">Versions</h2>
          <ul className="space-y-1">
            {versions.map((v) => (
              <li key={v.version}>
                <button onClick={() => load(v.version)} className={`w-full rounded-lg px-2 py-1 text-start text-sm ${v.version === current.version ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                  {v.version} <Pill tone={STATUS_TONE[v.status]}>{v.status}</Pill>
                </button>
              </li>
            ))}
          </ul>
          {user.role === "editor" && (
            <form className="flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); act(() => api("/referential/drafts", { body: { version: newVersion } }), `Brouillon ${newVersion} créé à partir de la version publiée.`, newVersion); }}>
              <input className={inputCls} value={newVersion} onChange={(e) => setNewVersion(e.target.value)} aria-label="Nouvelle version" />
              <Button type="submit">Nouveau brouillon</Button>
            </form>
          )}
        </Card>
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 font-semibold">Version {current.version} <Pill tone={STATUS_TONE[current.status]}>{current.status}</Pill></h2>
            <span className="text-sm text-slate-500">{current.counts.occupations} métiers · {current.counts.programs} formations</span>
          </div>
          {current.validation_errors.length > 0 ? (
            <Notice tone="error">Erreurs bloquantes : <ul className="list-disc ps-5">{current.validation_errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></Notice>
          ) : <Notice tone="success">Aucune erreur de validation.</Notice>}
          <div className="flex flex-wrap gap-2">
            {(NEXT[current.status] ?? []).filter((n) => n.role === user.role).map((n) => (
              <Button key={n.to} variant={n.to === "published" ? "primary" : "secondary"} onClick={() => act(() => api(`/referential/versions/${current.version}/transition`, { body: { to: n.to, comment: comment || null } }), `Transition effectuée : ${n.label}.`)}>{n.label}</Button>
            ))}
            {(NEXT[current.status] ?? []).some((n) => n.role === user.role) && <input className={`${inputCls} flex-1`} placeholder="Commentaire (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Commentaire" />}
          </div>
          <div className="flex gap-2">
            <select className="rounded-xl border border-slate-300 p-2" value={collection} onChange={(e) => { setCollection(e.target.value as typeof collection); setItemId(""); setJson(""); }} aria-label="Collection">
              <option value="occupations">Métiers</option><option value="programs">Formations</option>
            </select>
            <select className="flex-1 rounded-xl border border-slate-300 p-2" value={itemId} onChange={(e) => openItem(e.target.value)} aria-label="Fiche">
              <option value="">— Choisir une fiche —</option>
              {(collection === "occupations" ? current.content.occupations.map((o) => [o.id, o.name]) : current.content.programs.map((p) => [p.id, p.short])).map(([id, label]) => <option key={id} value={id}>{label} ({id})</option>)}
            </select>
          </div>
          {json && (
            <>
              <Field label={editable ? "Fiche (JSON) — modifiable dans un brouillon" : "Fiche (lecture seule)"}>
                <textarea className={`${inputCls} font-mono text-xs`} rows={16} value={json} readOnly={!editable} onChange={(e) => setJson(e.target.value)} />
              </Field>
              {editable && (
                <Button onClick={() => act(async () => {
                  let parsed: unknown;
                  try { parsed = JSON.parse(json); } catch { throw new Error("JSON invalide"); }
                  return api(`/referential/versions/${current.version}/${collection}/${itemId}`, { method: "PUT", body: parsed });
                }, "Fiche enregistrée dans le brouillon.")}>Enregistrer la fiche</Button>
              )}
            </>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium">Historique</summary>
            <ul className="mt-1 text-xs">{current.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("fr-FR")} → {h.to}{h.comment ? ` (« ${h.comment} »)` : ""}</li>)}</ul>
          </details>
        </Card>
      </div>
    </div>
  );
}
