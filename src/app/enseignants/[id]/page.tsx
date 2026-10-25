import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, Briefcase, CalendarDays, MapPin, Monitor } from "lucide-react";
import { RequestForm, ReviewForm } from "@/components/forms/request-forms";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, Rating, ScoreRing, Skeleton } from "@/components/ui/misc";
import { DAYS, LEVEL_LABEL, MODE_LABEL, PERIODS } from "@/lib/constants";
import { getOwnStudentProfile, getRelationWith, getTeacher, getViewer, listReviews } from "@/lib/data";
import { scoreTeacher } from "@/lib/matching";
import type { TeacherCard } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function TeacherPage({ params }: PageProps<"/enseignants/[id]">) {
  return (
    <div className="container-page py-10">
      <ButtonLink href="/enseignants" variant="ghost" size="sm" className="-ml-3 mb-6">
        <ArrowLeft className="size-4" /> Tous les enseignants
      </ButtonLink>
      <Suspense fallback={<Skeleton className="h-[36rem]" />}>
        <Teacher params={params} />
      </Suspense>
    </div>
  );
}

async function Teacher({ params }: Pick<PageProps<"/enseignants/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [teacher, reviews] = await Promise.all([getTeacher(id), listReviews(id)]);
  if (!teacher) notFound();
  const name = teacher.profile.full_name || "Enseignant";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card className="sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={name} size={84} />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              <p className="mt-1 text-muted">{teacher.headline}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <Rating value={teacher.rating_avg} count={teacher.rating_count} />
                <span className="flex items-center gap-1.5">
                  {teacher.mode === "online" ? <Monitor className="size-4" /> : <MapPin className="size-4" />}
                  {MODE_LABEL[teacher.mode]}
                  {teacher.mode !== "online" && teacher.profile.city ? ` · ${teacher.profile.city}` : ""}
                </span>
                {teacher.years_experience > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="size-4" /> {teacher.years_experience} ans d&apos;expérience
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {teacher.subjects.map((s) => (
              <Badge key={s} tone="brand">
                {s}
              </Badge>
            ))}
            {teacher.levels.map((l) => (
              <Badge key={l}>{LEVEL_LABEL[l]}</Badge>
            ))}
          </div>
        </Card>

        <Card className="sm:p-8">
          <h2 className="font-semibold">À propos</h2>
          <p className="mt-3 leading-relaxed whitespace-pre-line text-foreground/90">{teacher.bio}</p>
          {teacher.diplomas && (
            <p className="mt-5 flex items-start gap-2 text-sm text-muted">
              <Award className="mt-0.5 size-4 shrink-0 text-brand" /> {teacher.diplomas}
            </p>
          )}
        </Card>

        {teacher.availability.length > 0 && (
          <Card className="sm:p-8">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="size-4 text-brand" /> Disponibilités
            </h2>
            <AvailabilityView slots={teacher.availability} />
          </Card>
        )}

        <Card className="sm:p-8">
          <h2 className="font-semibold">Avis d&apos;élèves</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Pas encore d&apos;avis.</p>
          ) : (
            <ul className="mt-4 space-y-5">
              {reviews.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <Avatar name={r.student?.full_name || "Élève"} size={36} />
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{r.student?.full_name?.split(" ")[0] || "Élève"}</span>
                      <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                      <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-foreground/90">{r.comment}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <p className="text-3xl font-semibold">
            {teacher.hourly_rate} €<span className="text-base font-normal text-muted"> / heure</span>
          </p>
          <div className="mt-6">
            <Suspense fallback={<Skeleton className="h-64" />}>
              <ContactPanel teacher={teacher} />
            </Suspense>
          </div>
        </Card>
      </aside>
    </div>
  );
}

async function ContactPanel({ teacher }: { teacher: TeacherCard }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Créez un compte élève gratuit pour contacter cet enseignant.</p>
        <ButtonLink href="/inscription?role=student" className="w-full">
          Contacter {teacher.profile.full_name.split(" ")[0]}
        </ButtonLink>
        <ButtonLink href={`/connexion?next=/enseignants/${teacher.id}`} variant="ghost" className="w-full">
          J&apos;ai déjà un compte
        </ButtonLink>
      </div>
    );
  }
  if (viewer.id === teacher.id) {
    return (
      <ButtonLink href="/profil" variant="secondary" className="w-full">
        Modifier mon profil
      </ButtonLink>
    );
  }
  if (viewer.profile.role !== "student") {
    return <p className="text-sm text-muted">Les demandes de cours sont réservées aux comptes élèves.</p>;
  }

  const [student, relation] = await Promise.all([getOwnStudentProfile(viewer.id), getRelationWith(viewer, teacher.id)]);
  const match = student ? scoreTeacher({ ...student, city: viewer.profile.city }, teacher) : null;
  const pending = relation.requests.filter((r) => r.status === "pending");
  const defaultSubject = student?.subjects.find((s) => teacher.subjects.includes(s));

  return (
    <div className="space-y-6">
      {match && (
        <div className="flex items-center gap-4 rounded-2xl bg-surface-muted p-4">
          <ScoreRing score={match.score} />
          <div className="text-sm">
            <p className="font-medium">Compatibilité avec votre profil</p>
            {match.reasons[0] && <p className="text-muted">{match.reasons.slice(0, 2).join(" · ")}</p>}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <p className="rounded-2xl bg-warning/15 px-4 py-3 text-sm">
          Demande en attente : {pending.map((r) => r.subject).join(", ")}
        </p>
      )}
      <RequestForm teacherId={teacher.id} subjects={teacher.subjects} defaultSubject={defaultSubject} />
      {relation.canReview && (
        <div className="border-t border-border pt-6">
          <h3 className="mb-3 text-sm font-semibold">{relation.review ? "Votre avis" : "Laisser un avis"}</h3>
          <ReviewForm
            teacherId={teacher.id}
            defaultRating={relation.review?.rating}
            defaultComment={relation.review?.comment}
          />
        </div>
      )}
    </div>
  );
}

function AvailabilityView({ slots }: { slots: string[] }) {
  const set = new Set(slots);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {DAYS.map((d) => (
              <th key={d.value} className="pb-1 font-medium text-muted">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p.value}>
              <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap text-muted">
                {p.label}
              </th>
              {DAYS.map((d) => {
                const on = set.has(`${d.value}_${p.value}`);
                return (
                  <td key={d.value}>
                    <span
                      className={on ? "block h-7 rounded-md bg-brand" : "block h-7 rounded-md bg-surface-muted"}
                      aria-label={on ? `${d.label} ${p.label} : disponible` : undefined}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
