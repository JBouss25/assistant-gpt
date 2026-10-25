"use client";

import { useState } from "react";
import { useWidth } from "./use-width";

export type GradePoint = { date: string; grade: number; topics: string };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const fmtGrade = (g: number) => `${String(g).replace(".", ",")}/20`;

const H = 150;
const M = { top: 14, right: 52, bottom: 24, left: 26 };

/**
 * Évolution des notes /20 d'une matière (une seule série : pas de légende, le titre la nomme).
 * Échelle fixe 0–20 pour que les matières se comparent honnêtement.
 */
export function GradeChart({ points, label }: { points: GradePoint[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const times = points.map((p) => Date.parse(p.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (t: number) => M.left + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW);
  const y = (g: number) => M.top + innerH - (g / 20) * innerH;

  const xy = points.map((p, i) => [x(times[i]!), y(p.grade)] as const);
  const line = xy.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const area = xy.length > 1 ? `${line}L${xy.at(-1)![0]},${y(0)}L${xy[0]![0]},${y(0)}Z` : "";
  const last = xy.at(-1)!;

  function nearest(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left;
    let best = 0;
    xy.forEach(([cx], i) => {
      if (Math.abs(cx - px) < Math.abs(xy[best]![0] - px)) best = i;
    });
    return best;
  }

  const a = active === null ? null : points[active]!;
  const summary = `${label} : ${points.length} note${points.length > 1 ? "s" : ""}, de ${fmtGrade(points[0]!.grade)} à ${fmtGrade(points.at(-1)!.grade)}.`;

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${summary} Utilisez les flèches pour parcourir les notes.`}
        tabIndex={0}
        className="block touch-none overflow-visible outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-brand/40"
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
          if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
        }}
      >
        {/* Grille : traits fins, discrets */}
        {[0, 10, 20].map((g) => (
          <g key={g}>
            <line x1={M.left} x2={M.left + innerW} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 6} y={y(g)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">
              {g}
            </text>
          </g>
        ))}

        {area && <path d={area} fill="var(--chart-1)" fillOpacity={0.1} />}
        {xy.length > 1 && (
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {a && <line x1={xy[active!]![0]} x2={xy[active!]![0]} y1={M.top} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />}

        {xy.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={i === active ? 5.5 : 4}
            fill="var(--chart-1)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}

        {/* Libellé direct : la dernière note seulement */}
        <text x={last[0] + 9} y={last[1]} dy="0.32em" className="fill-foreground text-xs font-semibold">
          {fmtGrade(points.at(-1)!.grade)}
        </text>

        <text x={xy[0]![0]} y={H - 6} textAnchor={points.length > 1 ? "start" : "middle"} className="fill-muted text-[10px]">
          {dateFmt.format(new Date(points[0]!.date))}
        </text>
        {points.length > 1 && (
          <text x={last[0]} y={H - 6} textAnchor="end" className="fill-muted text-[10px]">
            {dateFmt.format(new Date(points.at(-1)!.date))}
          </text>
        )}
      </svg>

      {a && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-44 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          // À côté du point (à droite, ou à gauche près du bord) pour ne jamais le masquer.
          style={{
            left: xy[active!]![0] + 192 <= width ? xy[active!]![0] + 14 : Math.max(0, xy[active!]![0] - 190),
            top: 0,
          }}
        >
          <p className="text-sm font-semibold">{fmtGrade(a.grade)}</p>
          <p className="text-muted">{dateFmt.format(new Date(a.date))}</p>
          {a.topics && <p className="mt-0.5 line-clamp-2 text-muted">{a.topics}</p>}
        </div>
      )}
    </div>
  );
}
