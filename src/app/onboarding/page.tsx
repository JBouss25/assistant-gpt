import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { StudentProfileForm, TeacherProfileForm } from "@/components/forms/profile-forms";
import { Card, Skeleton } from "@/components/ui/misc";
import { getOwnStudentProfile, getOwnTeacherProfile, requireViewer } from "@/lib/data";

export const metadata: Metadata = { title: "Bienvenue" };

export default function OnboardingPage() {
  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Onboarding />
      </Suspense>
    </div>
  );
}

async function Onboarding() {
  const viewer = await requireViewer();
  if (viewer.profile.onboarded) redirect("/tableau-de-bord");
  const identity = { full_name: viewer.profile.full_name, city: viewer.profile.city };
  const isTeacher = viewer.profile.role === "teacher";

  return (
    <>
      <p className="text-sm font-medium text-brand">Étape 2 sur 2</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {isTeacher ? "Présentez votre enseignement" : "Parlez-nous de vous"}
      </h1>
      <p className="mt-2 text-muted">
        {isTeacher
          ? "Un profil complet reçoit jusqu'à 3× plus de demandes. Vous pourrez le modifier à tout moment."
          : "Ces informations alimentent notre algorithme de matching pour vous proposer les enseignants les plus adaptés."}
      </p>
      <Card className="mt-8 sm:p-8">
        {isTeacher ? (
          <TeacherProfileForm intent="onboarding" identity={identity} profile={await getOwnTeacherProfile(viewer.id)} />
        ) : (
          <StudentProfileForm intent="onboarding" identity={identity} profile={await getOwnStudentProfile(viewer.id)} />
        )}
      </Card>
    </>
  );
}
