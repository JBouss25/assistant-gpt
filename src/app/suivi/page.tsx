import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChartLine } from "lucide-react";
import { AddChildForm } from "@/components/forms/family-forms";
import { Avatar, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { LEVEL_LABEL } from "@/lib/constants";
import { requireViewer } from "@/lib/data";
import { listFollowedStudents } from "@/lib/progress";

export const metadata: Metadata = { title: "Suivi" };

export default function FollowPage() {
  return (
    <div className="container-page max-w-4xl py-12">
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Follow />
      </Suspense>
    </div>
  );
}

async function Follow() {
  const viewer = await requireViewer();
  if (viewer.profile.role === "student") redirect(`/suivi/${viewer.id}`);
  const students = await listFollowedStudents(viewer);
  const parent = viewer.profile.role === "parent";

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{parent ? "Mes enfants" : "Mes élèves"}</h1>
      <p className="mt-1 text-muted">
        {parent
          ? "Suivez les notes, les heures de cours et les comptes-rendus des enseignants."
          : "La progression de chaque élève, d'après vos comptes-rendus de séance."}
      </p>
      <div className="mt-8">
        {students.length === 0 ? (
          <EmptyState icon={<ChartLine className="size-5" />} title={parent ? "Aucun enfant relié" : "Aucun élève suivi"}>
            {parent
              ? "Ajoutez votre enfant avec le code affiché sur son profil Mentora."
              : "Vos élèves apparaîtront ici dès que vous aurez accepté leur demande."}
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {students.map((s) => (
              <li key={s.id}>
                <Link href={`/suivi/${s.id}`} className="block">
                  <Card className="flex items-center gap-4 p-5 transition hover:border-brand/40">
                    <Avatar name={s.name} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-sm text-muted">
                        {s.level ? LEVEL_LABEL[s.level] : "Élève"}
                        {s.grade ? ` · ${s.grade}` : ""}
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {parent && (
        <Card className="mt-8 max-w-md p-5">
          <h2 className="font-semibold">Ajouter un enfant</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Votre enfant trouve son code dans <strong>Mon profil</strong>, rubrique « Code parent ».
          </p>
          <AddChildForm />
        </Card>
      )}
    </>
  );
}
