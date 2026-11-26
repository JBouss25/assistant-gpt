"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Notice, Progress, inputCls } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { useSession } from "@/lib/useSession";

type Scale = { value: number; label: string }[];
interface Form {
  audience: "college" | "lycee";
  riasec: { scale: Scale; items: { id: string; dimension: string; text: string }[] };
  values: { cards: { id: string; label: string; icon: string }[] };
  self_efficacy: { scale: Scale; items: { id: string; text: string }[] };
  adaptability: { scale: Scale; items: { id: string; text: string }[] };
  tolerance: { scale: Scale; items: { id: string; text: string }[] };
  aptitude: { items: { id: string; title: string; text: string; options: string[] }[] };
  ai_critical: { items: { id: string; title: string; text: string; options: string[] }[] };
  sjt: { items: { id: string; title: string; text: string; options: { label: string }[] }[] };
}
type Responses = {
  riasec: Record<string, number>; sjt: Record<string, number>; aptitude: Record<string, number>; ai_critical: Record<string, number>;
  values: string[]; self_efficacy: Record<string, number>; adaptability: Record<string, number>; tolerance: Record<string, number>;
};
type Screen =
  | { kind: "intro"; stage: number; title: string; text: string }
  | { kind: "riasec"; id: string; text: string }
  | { kind: "sjt"; id: string; title: string; text: string; options: string[] }
  | { kind: "challenge"; group: "aptitude" | "ai_critical"; id: string; title: string; text: string; options: string[] }
  | { kind: "values" }
  | { kind: "selfview" }
  | { kind: "grades" }
  | { kind: "submit" };

const EMPTY: Responses = { riasec: {}, sjt: {}, aptitude: {}, ai_critical: {}, values: [], self_efficacy: {}, adaptability: {}, tolerance: {} };
const LOCAL_KEY = "orientation.assessment.draft";
const ENCOURAGE = ["Bien joué, on continue !", "Merci, c'est noté 👍", "Super, encore un petit effort !", "Top, tu avances bien !"];
const PERIODS = ["T1", "T2", "T3"];

function readLocal(): { responses: Responses; index: number } | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(v: { responses: Responses; index: number } | null) {
  try {
    if (v) window.localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* stockage indisponible */
  }
}

export default function Evaluation() {
  const user = useSession(["student"]);
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [level, setLevel] = useState<string>("");
  const [r, setR] = useState<Responses>(EMPTY);
  const [grades, setGrades] = useState<Record<string, Record<string, string>>>({});
  const [index, setIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [f, m, prof, draft, existing] = await Promise.all([
          api<Form>("/students/me/assessment/form"),
          api<Meta>("/meta/levels"),
          api<{ level: string }>("/students/me/profile"),
          api<{ responses: Partial<Responses> }>("/students/me/assessment/draft"),
          api<{ subject: string; period: string; value: number }[]>("/students/me/grades"),
        ]);
        setForm(f);
        setMeta(m);
        setLevel(prof.level);
        const local = readLocal();
        const restored = { ...EMPTY, ...(draft.responses ?? {}), ...(local?.responses ?? {}) } as Responses;
        if (!restored.values.length) restored.values = f.values.cards.map((c) => c.id);
        setR(restored);
        if (local?.index) setIndex(local.index);
        const g: Record<string, Record<string, string>> = {};
        for (const x of existing) (g[x.subject] ??= {})[x.period] = String(x.value);
        setGrades(g);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) router.replace("/eleve/onboarding");
        else setError(errorMessage(e));
      }
    })();
  }, [user, router]);

  const screens: Screen[] = useMemo(() => {
    if (!form) return [];
    const s: Screen[] = [
      { kind: "intro", stage: 0, title: "Étape 1 · Ce qui m'attire", text: "Pour chaque activité, dis-nous si elle te plaît. Il n'y a pas de bonne ou de mauvaise réponse." },
      ...form.riasec.items.map((it) => ({ kind: "riasec" as const, id: it.id, text: it.text })),
      ...form.sjt.items.map((it) => ({ kind: "sjt" as const, id: it.id, title: it.title, text: it.text, options: it.options.map((o) => o.label) })),
      { kind: "intro", stage: 1, title: "Étape 2 · Ce que je sais faire", text: "Quelques mini-défis, sans chronomètre. Prends ton temps : on regarde ta façon de raisonner." },
      // Attention : les items ont leur propre champ « kind » (logique, biais…) ; on ne garde que les champs utiles.
      ...form.aptitude.items.map((it) => ({ kind: "challenge" as const, group: "aptitude" as const, id: it.id, title: it.title, text: it.text, options: it.options })),
      ...form.ai_critical.items.map((it) => ({ kind: "challenge" as const, group: "ai_critical" as const, id: it.id, title: it.title, text: it.text, options: it.options })),
      { kind: "intro", stage: 2, title: "Étape 3 · Ce qui compte pour moi", text: "Classe ce qui compte le plus pour toi dans un futur métier." },
      { kind: "values" },
    ];
    if (form.audience === "lycee") s.push({ kind: "selfview" });
    s.push({ kind: "grades" }, { kind: "submit" });
    return s;
  }, [form]);

  const persist = useCallback((resp: Responses, idx: number) => {
    writeLocal({ responses: resp, index: idx });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api("/students/me/assessment/draft", { method: "PUT", body: resp }).catch(() => undefined); // hors-ligne : la copie locale fait foi
    }, 800);
  }, []);

  const go = (delta: number, resp = r) => {
    const idx = Math.max(0, Math.min(screens.length - 1, index + delta));
    setIndex(idx);
    persist(resp, idx);
    window.scrollTo({ top: 0 });
  };

  const answer = (group: keyof Responses, id: string, value: number) => {
    const next = { ...r, [group]: { ...(r[group] as Record<string, number>), [id]: value } } as Responses;
    setR(next);
    if (group === "aptitude" || group === "ai_critical") {
      setToast(ENCOURAGE[index % ENCOURAGE.length]);
      setTimeout(() => setToast(null), 1200);
    }
    setTimeout(() => go(1, next), 180);
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const list = Object.entries(grades).flatMap(([subject, per]) =>
        Object.entries(per).filter(([, v]) => v !== "").map(([period, v]) => ({ subject, period, value: Number(v.replace(",", ".")) })));
      if (list.some((g) => Number.isNaN(g.value) || g.value < 0 || g.value > 20)) throw new Error("Les notes doivent être comprises entre 0 et 20.");
      if (list.length) await api("/students/me/grades", { method: "PUT", body: list });
      await api("/students/me/assessment/submit", { body: r });
      writeLocal(null);
      try {
        await api("/students/me/recommendations", { body: {} });
        router.push("/eleve?nouveau=1");
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) router.push("/eleve?attente=1");
        else throw e;
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  if (error && !form) return <Notice tone="error">{error}</Notice>;
  if (!form || !meta) return <p className="p-6 text-center text-slate-500">Chargement…</p>;

  const screen = screens[index];
  const stage = index < screens.findIndex((s) => s.kind === "intro" && s.stage === 1) ? 0
    : index < screens.findIndex((s) => s.kind === "intro" && s.stage === 2) ? 1 : 2;
  const scale = form.riasec.scale;
  const subjects = meta.level_subjects[level] ?? [];

  return (
    <div className="mx-auto max-w-xl">
      <Progress step={stage} total={3} labels={["Ce qui m'attire", "Ce que je sais faire", "Ce qui compte"]} />
      <p className="mb-2 text-xs text-slate-500" aria-live="polite">Écran {index + 1} / {screens.length} · sauvegarde automatique</p>
      {toast && <div className="fade-in mb-2 rounded-xl bg-emerald-50 p-2 text-center text-sm text-emerald-800" role="status">{toast}</div>}
      <Card className="fade-in min-h-64 space-y-4" key={index}>
        {screen.kind === "intro" && (
          <>
            <h1 className="text-2xl font-bold">{screen.title}</h1>
            <p className="text-slate-700">{screen.text}</p>
            <Button onClick={() => go(1)} className="w-full">C&apos;est parti</Button>
          </>
        )}
        {screen.kind === "riasec" && (
          <>
            <p className="text-sm text-slate-500">Est-ce que ça te plairait de…</p>
            <h2 className="text-xl font-semibold">{screen.text}</h2>
            <div className={`grid gap-2 ${scale.length === 3 ? "grid-cols-3" : "grid-cols-1"}`}>
              {scale.map((o) => (
                <button key={o.value} onClick={() => answer("riasec", screen.id, o.value)} aria-pressed={r.riasec[screen.id] === o.value}
                  className={`min-h-12 rounded-xl border-2 px-3 py-2 ${r.riasec[screen.id] === o.value ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  {scale.length === 3 ? ["😍", "😐", "🙅"][scale.indexOf(o)] + " " : ""}{o.label}
                </button>
              ))}
            </div>
          </>
        )}
        {(screen.kind === "sjt" || screen.kind === "challenge") && (
          <>
            <p className="text-sm font-medium text-brand-700">{screen.title}</p>
            <h2 className="text-lg font-semibold">{screen.text}</h2>
            <div className="grid gap-2">
              {screen.options.map((o, i) => {
                const group = screen.kind === "sjt" ? "sjt" : screen.group;
                const selected = (r[group] as Record<string, number>)[screen.id] === i;
                return (
                  <button key={o} onClick={() => answer(group, screen.id, i)} aria-pressed={selected}
                    className={`min-h-12 rounded-xl border-2 px-3 py-2 text-start ${selected ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>{o}</button>
                );
              })}
            </div>
          </>
        )}
        {screen.kind === "values" && (
          <>
            <h2 className="text-xl font-semibold">Classe de 1 (le plus important) à 7</h2>
            <p className="text-sm text-slate-600">Glisse les cartes, ou utilise les flèches.</p>
            <ol className="space-y-2">
              {r.values.map((id, i) => {
                const card = form.values.cards.find((c) => c.id === id)!;
                const move = (d: number) => {
                  const v = [...r.values];
                  const j = i + d;
                  if (j < 0 || j >= v.length) return;
                  [v[i], v[j]] = [v[j], v[i]];
                  const next = { ...r, values: v };
                  setR(next);
                  persist(next, index);
                };
                return (
                  <li key={id} draggable onDragStart={() => setDragged(id)} onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!dragged || dragged === id) return;
                      const v = r.values.filter((x) => x !== dragged);
                      v.splice(v.indexOf(id), 0, dragged);
                      const next = { ...r, values: v };
                      setR(next);
                      persist(next, index);
                    }}
                    className="flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                    <span className="w-6 text-center font-bold text-brand-700">{i + 1}</span>
                    <span aria-hidden>{card.icon}</span>
                    <span className="flex-1">{card.label}</span>
                    <button onClick={() => move(-1)} aria-label={`Monter ${card.label}`} className="rounded px-2 hover:bg-slate-100">▲</button>
                    <button onClick={() => move(1)} aria-label={`Descendre ${card.label}`} className="rounded px-2 hover:bg-slate-100">▼</button>
                  </li>
                );
              })}
            </ol>
            <Button onClick={() => go(1)} className="w-full">Valider mon classement</Button>
          </>
        )}
        {screen.kind === "selfview" && (
          <>
            <h2 className="text-xl font-semibold">Comment tu te vois</h2>
            {(["self_efficacy", "adaptability", "tolerance"] as const).flatMap((g) => form[g].items.map((it) => (
              <fieldset key={it.id} className="border-b border-slate-100 pb-2">
                <legend className="text-sm">{it.text}</legend>
                <div className="mt-1 flex gap-1">
                  {form[g].scale.map((o) => (
                    <button key={o.value} title={o.label} aria-label={o.label} aria-pressed={r[g][it.id] === o.value}
                      onClick={() => { const next = { ...r, [g]: { ...r[g], [it.id]: o.value } }; setR(next); persist(next, index); }}
                      className={`h-9 flex-1 rounded-lg border text-sm ${r[g][it.id] === o.value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200"}`}>{o.value}</button>
                  ))}
                </div>
              </fieldset>
            )))}
            <p className="text-xs text-slate-500">1 = pas du tout d&apos;accord · 5 = tout à fait d&apos;accord</p>
            <Button onClick={() => go(1)} className="w-full">Suivant</Button>
          </>
        )}
        {screen.kind === "grades" && (
          <>
            <h2 className="text-xl font-semibold">Tes moyennes</h2>
            <p className="text-sm text-slate-600">Facultatif mais utile : au moins le dernier trimestre. Elles seront vérifiées par ton établissement.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className="text-start">Matière</th>{PERIODS.map((p) => <th key={p}>{p}</th>)}</tr></thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s}>
                      <td className="py-1 pe-2">{meta.subjects[s]}</td>
                      {PERIODS.map((p) => (
                        <td key={p} className="p-0.5">
                          <input aria-label={`${meta.subjects[s]} ${p}`} inputMode="decimal" className={`${inputCls} min-h-9 px-2 text-center`} value={grades[s]?.[p] ?? ""}
                            onChange={(e) => setGrades({ ...grades, [s]: { ...(grades[s] ?? {}), [p]: e.target.value } })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={() => go(1)} className="w-full">Suivant</Button>
          </>
        )}
        {screen.kind === "submit" && (
          <>
            <h2 className="text-2xl font-bold">Bravo, c&apos;est terminé ! 🎉</h2>
            <p className="text-slate-700">On calcule tes pistes. Souviens-toi : ce sont des propositions à discuter, pas une décision.</p>
            {error && <Notice tone="error">{error}</Notice>}
            <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Calcul en cours…" : "Voir mes pistes"}</Button>
          </>
        )}
      </Card>
      <div className="mt-3 flex justify-between">
        <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>← Retour</Button>
        {["riasec", "sjt", "challenge"].includes(screen.kind) && <Button variant="ghost" onClick={() => go(1)}>Passer →</Button>}
      </div>
    </div>
  );
}
