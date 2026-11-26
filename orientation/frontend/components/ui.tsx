"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Category } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300",
    secondary: "border border-brand-600 text-brand-700 bg-white hover:bg-brand-50 disabled:opacity-50",
    ghost: "text-brand-700 hover:bg-brand-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return <button className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 font-medium transition ${styles} ${className}`} {...props} />;
}

const CAT_STYLE: Record<Category, string> = {
  A: "bg-violet-100 text-violet-800 border-violet-300",
  B: "bg-sky-100 text-sky-800 border-sky-300",
  C: "bg-emerald-100 text-emerald-800 border-emerald-300",
};
const CAT_LABEL: Record<Category, string> = { A: "A · ambitieuse", B: "B · réaliste", C: "C · sécurisée" };

export function CategoryBadge({ category }: { category: Category }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${CAT_STYLE[category]}`}>{CAT_LABEL[category]}</span>;
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "violet" | "green" | "red" }) {
  const t = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-900",
    violet: "bg-violet-100 text-violet-800",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

/** Fourchette de score : jamais un chiffre unique présenté comme certain. */
export function ScoreRange({ low, high, label }: { low: number; high: number; label: string }) {
  return (
    <div aria-label={`Adéquation entre ${low} et ${high} sur 100, niveau ${label}`}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">
          {low}–{high} %
        </span>
        <span className="text-slate-600">adéquation {label}</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-slate-200" aria-hidden>
        <div className="absolute h-2 rounded-full bg-brand-500" style={{ insetInlineStart: `${low}%`, width: `${Math.max(2, high - low)}%` }} />
      </div>
    </div>
  );
}

export function Bar({ label, value, max = 100, hint }: { label: string; value: number; max?: number; hint?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{hint ?? Math.round(value)}</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-slate-200" aria-hidden>
        <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const t = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${t}`}>
      {children}
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <p className="animate-pulse p-6 text-center text-slate-500" role="status">
      {label}
    </p>
  );
}

export function Progress({ step, total, labels }: { step: number; total: number; labels?: string[] }) {
  return (
    <nav aria-label="Progression" className="mb-4">
      <ol className="flex gap-2">
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className="flex-1">
            <div className={`h-2 rounded-full ${i <= step ? "bg-brand-500" : "bg-slate-200"}`} />
            {labels && <span className={`mt-1 block text-xs ${i === step ? "font-semibold text-brand-700" : "text-slate-500"}`}>{labels[i]}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-brand-500";

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="no-print -mx-4 mb-3 flex gap-1 overflow-x-auto px-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${active === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function fmtMoney(cost: { annual_min: number; annual_max: number; currency: string } | null | undefined): string {
  if (!cost) return "non renseigné";
  const f = (n: number) => n.toLocaleString("fr-FR");
  if (cost.annual_max === 0) return "gratuit (public)";
  return cost.annual_min === cost.annual_max ? `${f(cost.annual_min)} ${cost.currency}/an` : `${f(cost.annual_min)} à ${f(cost.annual_max)} ${cost.currency}/an`;
}
