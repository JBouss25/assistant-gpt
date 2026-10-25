import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProgressView } from "@/components/progress-view";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Skeleton } from "@/components/ui/misc";
import { LEVEL_LABEL } from "@/lib/constants";
import { requireViewer } from "@/lib/data";
import { getStudentProgress } from "@/lib/progress";

export const metadata: Metadata = { title: "Progression" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProgressPage({ params }: PageProps<"/suivi/[id]">) {
  return (
    <div className="container-page py-10">
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Progress params={params} />
      </Suspense>
    </div>
  );
}

async function Progress({ params }: Pick<PageProps<"/suivi/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await requireViewer();
  const data = await getStudentProgress(viewer, id);
  if (!data) notFound();
  const { student, stats, reports } = data;
  const self = viewer.id === student.id;

  return (
    <>
      {!self && (
        <ButtonLink href="/suivi" variant="ghost" size="sm" className="-ml-3 mb-4">
          <ArrowLeft className="size-4" /> {viewer.profile.role === "parent" ? "Mes enfants" : "Mes élèves"}
        </ButtonLink>
      )}
      <div className="mb-8 flex items-center gap-4">
        <Avatar name={student.name} size={56} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{self ? "Ma progression" : student.name}</h1>
          <p className="text-muted">
            {student.level ? LEVEL_LABEL[student.level] : "Élève"}
            {student.grade ? ` · ${student.grade}` : ""}
            {viewer.profile.role === "teacher" && " · vos comptes-rendus"}
          </p>
        </div>
      </div>
      <ProgressView stats={stats} reports={reports} />
    </>
  );
}
