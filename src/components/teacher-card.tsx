import Link from "next/link";
import { MapPin, Monitor, Sparkles } from "lucide-react";
import { LEVEL_LABEL, MODE_LABEL } from "@/lib/constants";
import type { TeacherCard as Teacher } from "@/lib/types";
import { Avatar, Badge, Rating, ScoreRing } from "./ui/misc";

export function TeacherCard({
  teacher,
  score,
  reasons,
}: {
  teacher: Teacher;
  score?: number;
  reasons?: string[];
}) {
  const name = teacher.profile.full_name || "Enseignant";
  return (
    <Link
      href={`/enseignants/${teacher.id}`}
      className="group flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-xl hover:shadow-brand/5"
    >
      <div className="flex items-start gap-4">
        <Avatar name={name} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold group-hover:text-brand">{name}</h3>
            <Rating value={teacher.rating_avg} count={teacher.rating_count} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{teacher.headline}</p>
        </div>
        {score !== undefined && <ScoreRing score={score} size={52} />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {teacher.subjects.slice(0, 3).map((s) => (
          <Badge key={s} tone="brand">
            {s}
          </Badge>
        ))}
        {teacher.subjects.length > 3 && <Badge>+{teacher.subjects.length - 3}</Badge>}
        {teacher.levels.map((l) => (
          <Badge key={l}>{LEVEL_LABEL[l]}</Badge>
        ))}
      </div>

      {reasons && reasons.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-surface-muted p-3 text-xs text-muted">
          {reasons.slice(0, 3).map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-brand" />
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm">
        <span className="flex items-center gap-1.5 text-muted">
          {teacher.mode === "online" ? <Monitor className="size-4" /> : <MapPin className="size-4" />}
          {teacher.mode === "online" ? MODE_LABEL.online : teacher.profile.city || MODE_LABEL[teacher.mode]}
        </span>
        <span>
          <span className="font-semibold">{teacher.hourly_rate} €</span>
          <span className="text-muted">/h</span>
        </span>
      </div>
    </Link>
  );
}
