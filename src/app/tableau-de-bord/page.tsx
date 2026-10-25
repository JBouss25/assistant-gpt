import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CalendarDays, Check, Inbox, MessagesSquare, Search, Sparkles, Star, Users, X } from "lucide-react";
import { updateRequestStatus } from "@/app/actions/requests";
import { TeacherCard } from "@/components/teacher-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { LEVEL_LABEL } from "@/lib/constants";
import {
  getMatchesFor,
  getOwnStudentProfile,
  getOwnTeacherProfile,
  listRequests,
  requireViewer,
  type RequestWithPeople,
  type Viewer,
} from "@/lib/data";
import type { RequestStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function DashboardPage() {
  return (
    <div className="container-page py-12">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

async function Dashboard() {
  const viewer = await requireViewer();
  if (!viewer.profile.onboarded) redirect("/onboarding");
  return viewer.profile.role === "teacher" ? <TeacherDashboard viewer={viewer} /> : <StudentDashboard viewer={viewer} />;
}

function Greeting({ viewer, subtitle }: { viewer: Viewer; subtitle: string }) {
  const first = viewer.profile.full_name.split(" ")[0] || "";
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Bonjour {first} 👋</h1>
      <p className="mt-1 text-muted">{subtitle}</p>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-2 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand sm:size-11 sm:rounded-2xl">
        {icon}
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        <p className="text-xs leading-snug text-muted sm:text-sm">{label}</p>
      </div>
    </Card>
  );
}

async function StudentDashboard({ viewer }: { viewer: Viewer }) {
  const student = await getOwnStudentProfile(viewer.id);
  if (!student) redirect("/onboarding");
  const [matches, requests] = await Promise.all([getMatchesFor(student, viewer.profile.city), listRequests(viewer)]);
  const pending = requests.filter((r) => r.status === "pending").length;
  const accepted = requests.filter((r) => r.status === "accepted").length;

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Greeting
          viewer={viewer}
          subtitle={`${LEVEL_LABEL[student.level]}${student.grade ? ` · ${student.grade}` : ""} · ${student.subjects.join(", ")}`}
        />
        <div className="flex gap-2">
          <ButtonLink href="/profil" variant="secondary" size="sm">
            Affiner mes critères
          </ButtonLink>
          <ButtonLink href="/enseignants" size="sm">
            <Search className="size-4" /> Annuaire
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Enseignants compatibles" value={matches.length} icon={<Sparkles className="size-5" />} />
        <Stat label="Demandes en attente" value={pending} icon={<Inbox className="size-5" />} />
        <Stat label="Enseignants acceptés" value={accepted} icon={<Users className="size-5" />} />
      </div>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Vos meilleurs matchs</h2>
        <p className="mt-1 text-sm text-muted">Classés selon vos matières, votre niveau, vos créneaux et votre budget.</p>
        <div className="mt-6">
          {matches.length === 0 ? (
            <EmptyState icon={<Sparkles className="size-5" />} title="Pas encore de match">
              Aucun enseignant ne couvre encore votre niveau et vos matières. Élargissez vos critères ou revenez bientôt.
            </EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {matches.map((m) => (
                <TeacherCard key={m.teacher.id} teacher={m.teacher} score={m.score} reasons={m.reasons} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Mes demandes</h2>
        <div className="mt-6">
          <RequestList requests={requests} role="student" />
        </div>
      </section>
    </div>
  );
}

async function TeacherDashboard({ viewer }: { viewer: Viewer }) {
  const [teacher, requests] = await Promise.all([getOwnTeacherProfile(viewer.id), listRequests(viewer)]);
  if (!teacher) redirect("/onboarding");
  const pending = requests.filter((r) => r.status === "pending");
  const others = requests.filter((r) => r.status !== "pending");
  const students = new Set(requests.filter((r) => r.status === "accepted").map((r) => r.student_id)).size;

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Greeting viewer={viewer} subtitle={teacher.headline} />
        <div className="flex items-center gap-2">
          {!teacher.is_published && <Badge tone="warning">Profil masqué</Badge>}
          <ButtonLink href="/profil" variant="secondary" size="sm">
            Modifier mon profil
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Nouvelles demandes" value={pending.length} icon={<Inbox className="size-5" />} />
        <Stat label="Élèves suivis" value={students} icon={<Users className="size-5" />} />
        <Stat
          label={`${teacher.rating_count} avis`}
          value={teacher.rating_count ? Number(teacher.rating_avg).toFixed(1) : "—"}
          icon={<Star className="size-5" />}
        />
      </div>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Demandes à traiter</h2>
        <div className="mt-6">
          <RequestList requests={pending} role="teacher" emptyText="Aucune nouvelle demande pour le moment." />
        </div>
      </section>

      {others.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight">Historique</h2>
          <div className="mt-6">
            <RequestList requests={others} role="teacher" />
          </div>
        </section>
      )}
    </div>
  );
}

const STATUS: Record<RequestStatus, { label: string; tone: "warning" | "success" | "neutral" | "danger" }> = {
  pending: { label: "En attente", tone: "warning" },
  accepted: { label: "Acceptée", tone: "success" },
  declined: { label: "Déclinée", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

function RequestList({
  requests,
  role,
  emptyText = "Vous n'avez encore envoyé aucune demande.",
}: {
  requests: RequestWithPeople[];
  role: "student" | "teacher";
  emptyText?: string;
}) {
  if (requests.length === 0) {
    return (
      <EmptyState icon={<Inbox className="size-5" />} title="Rien ici pour l'instant">
        {emptyText}
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
      {requests.map((r) => {
        const other = role === "teacher" ? r.student : r.teacher;
        const name = other?.full_name || (role === "teacher" ? "Élève" : "Enseignant");
        const sp = r.student_profile;
        return (
          <li key={r.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <Avatar name={name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {role === "student" ? (
                  <Link href={`/enseignants/${r.teacher_id}`} className="font-medium hover:text-brand">
                    {name}
                  </Link>
                ) : (
                  <span className="font-medium">{name}</span>
                )}
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                <Badge tone="brand">{r.subject}</Badge>
                {role === "teacher" && r.score > 0 && <Badge>Compatibilité {r.score} %</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {sp ? `${LEVEL_LABEL[sp.level]}${sp.grade ? ` · ${sp.grade}` : ""} · ` : ""}
                {other?.city ? `${other.city} · ` : ""}
                {formatDate(r.created_at)}
              </p>
              {r.message && <p className="mt-2 text-sm whitespace-pre-line text-foreground/90">{r.message}</p>}
              {sp?.goals && role === "teacher" && (
                <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-xs text-muted">Objectifs : {sp.goals}</p>
              )}
            </div>
            {r.status === "accepted" && (
              <div className="flex shrink-0 gap-2">
                <ButtonLink href="/calendrier" variant="secondary" size="sm">
                  <CalendarDays className="size-4" /> Planifier
                </ButtonLink>
                <ButtonLink href={`/messages/${r.id}`} size="sm">
                  <MessagesSquare className="size-4" /> Écrire
                </ButtonLink>
              </div>
            )}
            {r.status === "pending" && (
              <div className="flex shrink-0 gap-2">
                {role === "teacher" ? (
                  <>
                    <StatusButton id={r.id} status="declined" variant="danger" label="Décliner">
                      <X className="size-4" />
                    </StatusButton>
                    <StatusButton id={r.id} status="accepted" variant="primary" label="Accepter">
                      <Check className="size-4" />
                    </StatusButton>
                  </>
                ) : (
                  <StatusButton id={r.id} status="cancelled" variant="secondary" label="Annuler" />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StatusButton({
  id,
  status,
  variant,
  label,
  children,
}: {
  id: string;
  status: "accepted" | "declined" | "cancelled";
  variant: "primary" | "secondary" | "danger";
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={updateRequestStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant} size="sm">
        {children}
        {label}
      </Button>
    </form>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
