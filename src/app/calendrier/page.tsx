import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { LessonForm } from "@/components/forms/lesson-form";
import { LessonItem } from "@/components/lesson-item";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { listConversations, listLessons, listLessonsToConfirm, otherName, type LessonWithPeople } from "@/lib/conversations";
import { requireViewer, type Viewer } from "@/lib/data";
import {
  addDays,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  formatLongDate,
  formatShortDay,
  formatTime,
  isIsoDate,
  nowMs,
  parisParts,
  parisToUtc,
  todayParis,
  weekStart,
} from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendrier" };

const HOUR_PX = 48;
const HOURS = Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, i) => CALENDAR_START_HOUR + i);

export default function CalendarPage({ searchParams }: PageProps<"/calendrier">) {
  return (
    <div className="container-page py-12">
      <Suspense fallback={<Skeleton className="h-[48rem]" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Calendar({ searchParams }: Pick<PageProps<"/calendrier">, "searchParams">) {
  const { semaine } = await searchParams;
  const viewer = await requireViewer();
  const today = todayParis();
  const now = nowMs();
  const start = weekStart(isIsoDate(semaine) ? semaine : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const [lessons, toConfirm, conversations] = await Promise.all([
    listLessons(viewer, parisToUtc(start, "00:00"), parisToUtc(addDays(start, 7), "00:00")),
    listLessonsToConfirm(viewer),
    listConversations(viewer),
  ]);
  const partners = conversations.map((c) => ({ requestId: c.id, label: `${c.other.name} · ${c.subject}` }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendrier</h1>
          <p className="mt-1 text-muted">
            Semaine du {formatLongDate(start)} · {lessons.length} cours
          </p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Navigation par semaine">
          <Link href={`/calendrier?semaine=${addDays(start, -7)}`} className={buttonClass("secondary", "sm", "px-2")} aria-label="Semaine précédente">
            <ChevronLeft className="size-4" />
          </Link>
          <ButtonLink href="/calendrier" variant="secondary" size="sm">
            Aujourd&apos;hui
          </ButtonLink>
          <Link href={`/calendrier?semaine=${addDays(start, 7)}`} className={buttonClass("secondary", "sm", "px-2")} aria-label="Semaine suivante">
            <ChevronRight className="size-4" />
          </Link>
        </nav>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <WeekGrid days={days} today={today} lessons={lessons} viewer={viewer} />
          <AgendaList days={days} lessons={lessons} viewer={viewer} now={now} />
        </div>

        <aside className="space-y-6">
          {toConfirm.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">À confirmer ({toConfirm.length})</h2>
              <ul className="space-y-2">
                {toConfirm.map((l) => (
                  <LessonItem key={l.id} lesson={l} viewerId={viewer.id} now={now} withName={otherName(viewer, l)} />
                ))}
              </ul>
            </section>
          )}
          <Card className="p-5">
            <h2 className="font-semibold">Réserver un cours</h2>
            <p className="mt-1 mb-4 text-xs text-muted">Séances de 1 h 30 à 2 h, à confirmer par l&apos;autre participant.</p>
            {partners.length > 0 ? (
              <LessonForm partners={partners} minDate={addDays(today, 1)} />
            ) : (
              <p className="text-sm text-muted">
                {viewer.profile.role === "teacher"
                  ? "Acceptez une demande d'élève pour pouvoir planifier des cours."
                  : "Une fois votre demande acceptée par un enseignant, vous pourrez réserver vos cours ici."}
              </p>
            )}
          </Card>
          <Legend />
        </aside>
      </div>
    </div>
  );
}

type Placed = { lesson: LessonWithPeople; day: number; top: number; height: number };

function place(days: string[], lessons: LessonWithPeople[]): Placed[] {
  const min = CALENDAR_START_HOUR * 60;
  const max = CALENDAR_END_HOUR * 60;
  return lessons.flatMap((lesson) => {
    const s = parisParts(new Date(lesson.starts_at));
    const day = days.indexOf(s.date);
    if (day < 0) return [];
    const from = Math.max(min, s.hour * 60 + s.minute);
    const to = Math.min(max, s.hour * 60 + s.minute + lesson.duration_minutes);
    if (to <= from) return [];
    return [{ lesson, day, top: ((from - min) / 60) * HOUR_PX, height: ((to - from) / 60) * HOUR_PX }];
  });
}

function WeekGrid({ days, today, lessons, viewer }: { days: string[]; today: string; lessons: LessonWithPeople[]; viewer: Viewer }) {
  const placed = place(days, lessons);
  return (
    <div className="hidden overflow-hidden rounded-3xl border border-border bg-surface md:block">
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border">
        <div />
        {days.map((d) => (
          <div key={d} className={cn("py-3 text-center text-sm capitalize", d === today ? "font-semibold text-brand" : "text-muted")}>
            {formatShortDay(d)}
          </div>
        ))}
      </div>
      <div className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]" style={{ height: HOURS.length * HOUR_PX }}>
        <div>
          {HOURS.map((h) => (
            <div key={h} className="relative text-right text-[11px] text-muted" style={{ height: HOUR_PX }}>
              <span className="absolute -top-2 right-2">{h} h</span>
            </div>
          ))}
        </div>
        {days.map((d, i) => (
          <div key={d} className={cn("relative border-l border-border", d === today && "bg-brand-soft/40")}>
            {HOURS.map((h) => (
              <div key={h} className="border-t border-border/60" style={{ height: HOUR_PX }} />
            ))}
            {placed
              .filter((p) => p.day === i)
              .map(({ lesson, top, height }) => (
                <div
                  key={lesson.id}
                  style={{ top, height }}
                  className={cn(
                    "absolute inset-x-1 overflow-hidden rounded-xl border-l-4 px-2 py-1.5 text-xs",
                    lesson.status === "confirmed"
                      ? "border-brand bg-brand-soft text-foreground"
                      : "border-accent border-dashed bg-accent-soft text-foreground",
                  )}
                  title={`${lesson.subject} avec ${otherName(viewer, lesson)}`}
                >
                  <p className="font-semibold tabular-nums">
                    {formatTime(lesson.starts_at)} – {formatTime(lesson.ends_at)}
                  </p>
                  <p className="truncate">{lesson.subject}</p>
                  <p className="truncate text-muted">{otherName(viewer, lesson)}</p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vue liste sur mobile. */
function AgendaList({
  days,
  lessons,
  viewer,
  now,
}: {
  days: string[];
  lessons: LessonWithPeople[];
  viewer: Viewer;
  now: number;
}) {
  const byDay = days
    .map((d) => ({ day: d, items: lessons.filter((l) => parisParts(new Date(l.starts_at)).date === d) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="md:hidden">
      {byDay.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-5" />} title="Aucun cours cette semaine" />
      ) : (
        <div className="space-y-5">
          {byDay.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{formatShortDay(g.day)}</h2>
              <ul className="space-y-2">
                {g.items.map((l) => (
                  <LessonItem key={l.id} lesson={l} viewerId={viewer.id} now={now} withName={otherName(viewer, l)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded border-l-4 border-brand bg-brand-soft" /> Confirmé
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded border-l-4 border-dashed border-accent bg-accent-soft" /> En attente de confirmation
      </span>
    </div>
  );
}
