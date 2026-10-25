"use client";

import { useState } from "react";
import { useWidth } from "./use-width";

export type MonthHours = { month: string; label: string; hours: number };

const H = 170;
const M = { top: 22, right: 8, bottom: 26, left: 8 };
const fmtHours = (h: number) => `${String(h).replace(".", ",")} h`;

/** Heures de cours réalisées par mois (une série, valeurs écrites sur le haut des barres). */
export function HoursChart({ data }: { data: MonthHours[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const band = innerW / data.length;
  const barW = Math.min(24, band * 0.55);
  const max = Math.max(2, ...data.map((d) => d.hours));
  const top = Math.ceil(max / 2) * 2;
  const y = (h: number) => M.top + innerH - (h / top) * innerH;
  const base = y(0);

  // Barre arrondie (4 px) côté valeur, carrée sur la ligne de base.
  const barPath = (x0: number, y0: number) => {
    const h = base - y0;
    const r = Math.min(4, h, barW / 2);
    return `M${x0},${base}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${base}Z`;
  };

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} className="block overflow-visible" role="group" aria-label="Heures de cours par mois">
        <line x1={M.left} x2={M.left + innerW} y1={base} y2={base} stroke="var(--border)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = M.left + band * i + band / 2;
          const x0 = cx - barW / 2;
          const y0 = y(d.hours);
          return (
            <g
              key={d.month}
              tabIndex={0}
              role="img"
              aria-label={`${d.label} : ${fmtHours(d.hours)}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none"
            >
              {/* Zone de survol plus grande que la barre */}
              <rect x={M.left + band * i} y={M.top} width={band} height={innerH} fill="transparent" />
              {d.hours > 0 && (
                <path d={barPath(x0, y0)} fill="var(--chart-2)" opacity={active === null || active === i ? 1 : 0.55} />
              )}
              {d.hours > 0 && (
                <text x={cx} y={y0 - 6} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
                  {fmtHours(d.hours)}
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted text-[11px] capitalize">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(M.left + band * active + band / 2 - 50, 0), width - 100), top: 0, width: 100 }}
        >
          <p className="text-sm font-semibold">{fmtHours(data[active]!.hours)}</p>
          <p className="text-muted capitalize">{data[active]!.label}</p>
        </div>
      )}
    </div>
  );
}
