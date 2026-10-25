import { Check, Clock, X } from "lucide-react";
import { updateLessonStatus } from "@/app/actions/messaging";
import type { LessonWithPeople } from "@/lib/conversations";
import { durationLabel, formatDay, formatTime } from "@/lib/time";
import type { Lesson } from "@/lib/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/misc";

function StatusForm({ id, status, children }: { id: string; status: "confirmed" | "cancelled"; children: React.ReactNode }) {
  return (
    <form action={updateLessonStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {children}
    </form>
  );
}

/** Ligne de cours : date, horaire, statut et actions (confirmer / annuler). */
export function LessonItem({
  lesson,
  viewerId,
  withName,
  now,
}: {
  lesson: Lesson | LessonWithPeople;
  viewerId: string;
  withName?: string;
  /** Instant de référence (ms), fourni par la page. */
  now: number;
}) {
  const upcoming = Date.parse(lesson.starts_at) > now;
  const canConfirm = lesson.status === "proposed" && lesson.proposed_by !== viewerId && upcoming;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium first-letter:uppercase">{formatDay(lesson.starts_at)}</span>
          {lesson.status === "confirmed" ? (
            <Badge tone="success">Confirmé</Badge>
          ) : (
            <Badge tone="warning">{lesson.proposed_by === viewerId ? "En attente de réponse" : "À confirmer"}</Badge>
          )}
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
          <Clock className="mt-0.5 size-3.5 shrink-0" />
          <span>
          {formatTime(lesson.starts_at)} – {formatTime(lesson.ends_at)} · {durationLabel(lesson.duration_minutes)} ·{" "}
          {lesson.subject}
          {withName ? ` · ${withName}` : ""}
          </span>
        </p>
        {lesson.note && <p className="mt-1 text-xs text-muted">{lesson.note}</p>}
      </div>
      {upcoming && (
        <div className="flex flex-wrap gap-2">
          <StatusForm id={lesson.id} status="cancelled">
            <Button type="submit" size="sm" variant="danger">
              <X className="size-4" /> Annuler
            </Button>
          </StatusForm>
          {canConfirm && (
            <StatusForm id={lesson.id} status="confirmed">
              <Button type="submit" size="sm">
                <Check className="size-4" /> Confirmer
              </Button>
            </StatusForm>
          )}
        </div>
      )}
    </li>
  );
}
