import type { ComponentProps, ReactNode } from "react";
import { Star } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-3xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)}
      {...props}
    />
  );
}

const badgeTones = {
  neutral: "bg-surface-muted text-muted",
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-[oklch(0.5_0.12_75)]",
  danger: "bg-danger/10 text-danger",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const avatarColors = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-rose-500 to-orange-400",
  "from-fuchsia-500 to-pink-400",
];

export function Avatar({ name, size = 48, className }: { name: string; size?: number; className?: string }) {
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-white",
        avatarColors[hash % avatarColors.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  if (count === 0) return <span className="text-xs text-muted">Nouveau</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-4 fill-amber-400 text-amber-400" />
      <span className="font-medium">{Number(value).toFixed(1)}</span>
      <span className="text-muted">({count})</span>
    </span>
  );
}

/** Anneau de compatibilité 0–100. */
export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? "text-success" : score >= 60 ? "text-brand" : "text-warning";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`Compatibilité ${score} %`}>
      <svg viewBox="0 0 50 50" className="size-full -rotate-90">
        <circle cx="25" cy="25" r={r} className="fill-none stroke-surface-muted" strokeWidth="5" />
        <circle
          cx="25"
          cy="25"
          r={r}
          className={cn("fill-none stroke-current transition-all", tone)}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {score}
      </span>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-surface-muted", className)} />;
}
