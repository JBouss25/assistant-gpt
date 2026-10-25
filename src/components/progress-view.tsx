import { BookOpenCheck, CalendarClock, Clock, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { GradeChart } from "@/components/charts/grade-chart";
import { HoursChart } from "@/components/charts/hours-chart";
import { Card, EmptyState } from "@/components/ui/misc";
import type { ReportWithTeacher } from "@/lib/progress";
import type { ProgressStats } from "@/lib/progress-stats";
import { formatDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const num = (n: number) => String(n).replace(".", ",");

function Tile({ label, value, detail, icon }: { label: string; value: string; detail?: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {detail && <div className="mt-0.5 text-xs text-muted">{detail}</div>}
    </Card>
  );
}

/** Tendance : signe + icône + libellé (jamais la couleur seule). */
function Trend({ value }: { value: number | null }) {
  if (value === null) return <span>Pas encore assez de notes</span>;
  if (value === 0) return <span>Stable par rapport aux 3 précédentes</span>;
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-success" : "text-danger")}>
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      <span className="text-muted">
        {up ? "+" : "−"}
        {num(Math.abs(value))} pt par rapport aux 3 précédentes
      </span>
    </span>
  );
}

export function ProgressView({ stats, reports }: { stats: ProgressStats; reports: ReportWithTeacher[] }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Moyenne récente"
          icon={<BookOpenCheck className="size-4" />}
          value={stats.recentAverage === null ? "—" : `${num(stats.recentAverage)}/20`}
          detail={<Trend value={stats.trend} />}
        />
        <Tile
          label="Heures de cours"
          icon={<Clock className="size-4" />}
          value={`${num(stats.hoursDone)} h`}
          detail={`${stats.reportCount} compte${stats.reportCount > 1 ? "s" : ""}-rendu${stats.reportCount > 1 ? "s" : ""}`}
        />
        <Tile
          label="Implication moyenne"
          icon={<Flame className="size-4" />}
          value={stats.engagementAverage === null ? "—" : `${num(stats.engagementAverage)}/5`}
          detail="Évaluée par l'enseignant"
        />
        <Tile
          label="Prochain cours"
          icon={<CalendarClock className="size-4" />}
          value={stats.nextLesson ? formatTime(stats.nextLesson.starts_at) : "—"}
          detail={stats.nextLesson ? <span className="inline-block first-letter:uppercase">{formatDay(stats.nextLesson.starts_at)}</span> : "Aucun cours prévu"}
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Évolution des notes</h2>
        <p className="mt-1 text-sm text-muted">Note /20 attribuée par l&apos;enseignant à la fin de chaque cours.</p>
        {stats.bySubject.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<BookOpenCheck className="size-5" />} title="Pas encore de compte-rendu">
              Les notes apparaîtront ici après le premier cours, dès que l&apos;enseignant aura rédigé son compte-rendu.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {stats.bySubject.map((s) => (
              <Card key={s.subject} className="p-5">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{s.subject}</h3>
                  <span className="text-xs text-muted">
                    {s.points.length} note{s.points.length > 1 ? "s" : ""}
                    {s.points.length > 1 && ` · ${s.delta >= 0 ? "+" : "−"}${num(Math.abs(s.delta))} pt`}
                  </span>
                </div>
                <GradeChart points={s.points} label={s.subject} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Heures de cours par mois</h2>
        <p className="mt-1 text-sm text-muted">Cours confirmés et terminés, sur les 6 derniers mois.</p>
        <Card className="mt-4 p-5">
          <HoursChart data={stats.hoursByMonth} />
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Comptes-rendus</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Aucun compte-rendu pour le moment.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {r.subject} <span className="font-normal text-muted">· {formatDay(r.lesson_date)}</span>
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold">{num(Number(r.grade))}/20</span>
                      <span className="text-muted"> · implication {r.engagement}/5</span>
                    </p>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
                    <dt className="text-muted">Notions</dt>
                    <dd>{r.topics}</dd>
                    {r.homework && (
                      <>
                        <dt className="text-muted">À faire</dt>
                        <dd>{r.homework}</dd>
                      </>
                    )}
                    {r.comment && (
                      <>
                        <dt className="text-muted">Commentaire</dt>
                        <dd className="whitespace-pre-line">{r.comment}</dd>
                      </>
                    )}
                  </dl>
                  <p className="mt-3 text-xs text-muted">Par {r.teacher?.full_name || "l'enseignant"}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {reports.length > 0 && (
          <details className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-medium">Voir toutes les notes sous forme de tableau</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1.5 font-medium">Date</th>
                    <th className="font-medium">Matière</th>
                    <th className="text-right font-medium">Note</th>
                    <th className="text-right font-medium">Implication</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {reports.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5">{new Date(r.lesson_date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                      <td>{r.subject}</td>
                      <td className="text-right">{num(Number(r.grade))}/20</td>
                      <td className="text-right">{r.engagement}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
