"use client";

import { useEffect, useState } from "react";
import { Button, Card, CategoryBadge, Loading, Notice, Tabs, fmtMoney, inputCls } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Category, RefSummary } from "@/lib/types";
import { useSession } from "@/lib/useSession";

interface Child { student_id: number; display_name: string; shared_scopes: string[] }
interface Summary {
  display_name: string;
  pistes?: { program_id: string; name: string; short: string; category: Category; category_label: string; fit_score: { low: number; high: number }; duration_years: number;
    cost: { annual_min: number; annual_max: number; currency: string } | null; occupations: string[]; prerequisites: string[]; bridges: RefSummary[]; vigilance: string[] }[];
  bilan?: { created_at: string; referential_version: string };
  milestones?: { label: string; status: string }[];
  evidence?: { title: string; verified: boolean }[];
  counselor_notes: { text: string; created_at: string }[];
  talk_guide: { questions: string[]; avoid: string[]; short_paths: string };
  disclaimer?: string;
}

const PATHS = [
  { t: "CPGE (classes préparatoires)", d: "Deux ans intensifs pour préparer les concours des grandes écoles d'ingénieurs ou de commerce. Exigeant, gratuit dans le public, internat possible.", myth: "« Il faut être un génie. » En réalité, la régularité et la méthode comptent autant que le niveau de départ." },
  { t: "Écoles post-bac (ENSA, ENSAM, ENCG…)", d: "Cycle intégré de 5 ans après un concours. Accès sélectif, frais limités dans le public.", myth: "« Si on rate le concours, c'est fini. » D'autres voies permettent d'y entrer plus tard, sur titre." },
  { t: "BTS, DUT / EST, OFPPT", d: "Formations courtes (2 ans), professionnalisantes, très demandées par les entreprises.", myth: "« C'est une voie de garage. » Faux : licence professionnelle puis cycle ingénieur sur titre restent accessibles." },
  { t: "Université (facultés)", d: "Licences en accès ouvert, puis masters. Demande de l'autonomie, coûts très faibles.", myth: "« La fac, c'est pour ceux qui n'ont pas été pris ailleurs. » Beaucoup de parcours d'excellence y passent." },
  { t: "Privé reconnu par l'État", d: "Écoles et universités privées dont les diplômes sont reconnus. Frais à vérifier, bourses parfois possibles.", myth: "« Plus c'est cher, mieux c'est. » Vérifiez la reconnaissance du diplôme et l'insertion des diplômés." },
  { t: "Études à l'étranger", d: "France (Parcoursup, puis son successeur en 2028), autres pays. Prévoir budget, logement et visa.", myth: "« Un diplôme étranger vaut toujours plus. » Tout dépend du métier visé et de l'équivalence au Maroc." },
];

export default function ParentHome() {
  const user = useSession(["parent"]);
  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [summaryState, setSummaryState] = useState<{ id: number; data: Summary | null; error: string | null } | null>(null);
  const [tab, setTab] = useState("synthese");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api<Child[]>("/parent/children")
      .then((c) => { if (alive) setChildren(c); })
      .catch((e) => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [user, reload]);
  const current = selected ?? children?.[0]?.student_id ?? null;
  useEffect(() => {
    if (current === null) return;
    let alive = true;
    api<Summary>(`/parent/children/${current}/summary`)
      .then((data) => { if (alive) setSummaryState({ id: current, data, error: null }); })
      .catch((e) => { if (alive) setSummaryState({ id: current, data: null, error: errorMessage(e) }); });
    return () => { alive = false; };
  }, [current]);
  const summary = summaryState?.id === current ? summaryState.data : null;
  const summaryError = summaryState?.id === current ? summaryState.error : null;

  if (!user || !children) return <Loading />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bonjour, {user.display_name}</h1>
      <p className="text-slate-600">Vous voyez uniquement ce que votre enfant a choisi de partager. Ces informations sont des repères pour en discuter ensemble, pas une décision.</p>
      {children.length > 1 && (
        <select className={inputCls} value={current ?? ""} onChange={(e) => setSelected(Number(e.target.value))} aria-label="Enfant">
          {children.map((c) => <option key={c.student_id} value={c.student_id}>{c.display_name}</option>)}
        </select>
      )}
      <Card>
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api("/parent/accept", { body: { invite_code: code } }); setCode(""); setReload((n) => n + 1); } catch (err) { setError(errorMessage(err)); } }}>
          <input className={`${inputCls} flex-1`} placeholder="Code d'invitation reçu par SMS / e-mail" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code d'invitation" required />
          <Button type="submit">Relier un enfant</Button>
        </form>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      {summaryError && <Notice tone="warn">{summaryError === "Accès non autorisé à ces données" ? "Votre enfant n'a encore rien partagé avec vous. Vous pouvez en parler avec lui ou elle." : summaryError}</Notice>}
      {children.length === 0 && <Notice tone="info">Aucun enfant relié pour l&apos;instant : saisissez le code d&apos;invitation reçu.</Notice>}
      <Tabs tabs={[{ id: "synthese", label: "Synthèse" }, { id: "voies", label: "Comprendre les voies" }, { id: "parler", label: "En parler ensemble" }]} active={tab} onChange={setTab} />
      {tab === "synthese" && summary && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-xl font-semibold">Synthèse — {summary.display_name}</h2>
            <Button variant="secondary" className="no-print" onClick={() => window.print()}>Imprimer</Button>
          </div>
          {summary.bilan && <p className="text-sm text-slate-500">Bilan du {new Date(summary.bilan.created_at).toLocaleDateString("fr-FR")} · référentiel {summary.bilan.referential_version}</p>}
          {!summary.pistes && <Notice tone="info">Les pistes ne sont pas partagées pour le moment.</Notice>}
          <div className="grid gap-3 md:grid-cols-3">
            {summary.pistes?.map((p) => (
              <Card key={p.program_id} className="space-y-2 text-sm">
                <div className="flex items-start gap-2"><h3 className="flex-1 font-semibold">{p.short}</h3><CategoryBadge category={p.category} /></div>
                <p>Adéquation : {p.fit_score.low}–{p.fit_score.high} %</p>
                <p>Durée : {p.duration_years} an(s) · Coût : {fmtMoney(p.cost)}</p>
                <p>Débouchés : {p.occupations.join(", ")}</p>
                <p className="text-slate-600">Prérequis : {p.prerequisites.join(" ; ")}</p>
                {p.bridges.length > 0 && <p className="text-slate-600">Passerelles : {p.bridges.map((b) => b.short).join(", ")}</p>}
                {p.vigilance.map((v) => <p key={v} className="text-amber-900">À anticiper : {v}</p>)}
              </Card>
            ))}
          </div>
          {summary.milestones && (
            <Card>
              <h3 className="font-semibold">Objectifs en cours</h3>
              <ul className="mt-1 list-disc ps-5 text-sm">{summary.milestones.map((m) => <li key={m.label}>{m.label} {m.status === "done" && "✅"}</li>)}</ul>
            </Card>
          )}
          {summary.evidence && summary.evidence.length > 0 && (
            <Card>
              <h3 className="font-semibold">Ses réalisations</h3>
              <ul className="mt-1 list-disc ps-5 text-sm">{summary.evidence.map((e) => <li key={e.title}>{e.title} {e.verified && "(vérifiée)"}</li>)}</ul>
            </Card>
          )}
          {summary.counselor_notes.length > 0 && (
            <Card>
              <h3 className="font-semibold">Message du conseiller d&apos;orientation</h3>
              {summary.counselor_notes.map((n) => <p key={n.created_at} className="mt-1 text-sm">{n.text}</p>)}
            </Card>
          )}
          {summary.disclaimer && <p className="text-sm italic text-slate-600">Ces pistes sont des propositions à discuter avec votre enfant et son conseiller, pas une décision.</p>}
        </div>
      )}
      {tab === "voies" && (
        <div className="grid gap-3 md:grid-cols-2">
          {PATHS.map((p) => (
            <Card key={p.t}>
              <h3 className="font-semibold">{p.t}</h3>
              <p className="mt-1 text-sm">{p.d}</p>
              <p className="mt-2 text-sm text-slate-600"><strong>Mythe et réalité :</strong> {p.myth}</p>
            </Card>
          ))}
        </div>
      )}
      {tab === "parler" && summary && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <h3 className="font-semibold">5 questions à poser cette semaine</h3>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm">{summary.talk_guide.questions.map((q) => <li key={q}>{q}</li>)}</ol>
          </Card>
          <Card>
            <h3 className="font-semibold">Erreurs fréquentes à éviter</h3>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{summary.talk_guide.avoid.map((q) => <li key={q}>{q}</li>)}</ul>
            <p className="mt-3 text-sm text-slate-700">{summary.talk_guide.short_paths}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
