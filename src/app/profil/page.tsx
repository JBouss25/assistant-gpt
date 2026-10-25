import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { DeleteAccountForm } from "@/components/forms/delete-account-form";
import { StudentProfileForm, TeacherProfileForm } from "@/components/forms/profile-forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/misc";
import { getOwnStudentProfile, getOwnTeacherProfile, requireViewer } from "@/lib/data";

export const metadata: Metadata = { title: "Mon profil" };

export default function ProfilePage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Profile />
      </Suspense>
    </div>
  );
}

async function Profile() {
  const viewer = await requireViewer();
  const identity = { full_name: viewer.profile.full_name, city: viewer.profile.city };
  const isTeacher = viewer.profile.role === "teacher";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mon profil</h1>
          <p className="mt-1 text-muted">{viewer.email}</p>
        </div>
        {isTeacher && (
          <ButtonLink href={`/enseignants/${viewer.id}`} variant="secondary" size="sm">
            Voir ma page publique <ExternalLink className="size-3.5" />
          </ButtonLink>
        )}
      </div>
      <Card className="mt-8 sm:p-8">
        {isTeacher ? (
          <TeacherProfileForm intent="edit" identity={identity} profile={await getOwnTeacherProfile(viewer.id)} />
        ) : (
          <StudentProfileForm intent="edit" identity={identity} profile={await getOwnStudentProfile(viewer.id)} />
        )}
      </Card>
      <Card className="mt-6 border-danger/30 sm:p-8">
        <h2 className="font-semibold">Supprimer mon compte</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Supprime définitivement votre compte et toutes vos données. Vos interlocuteurs ne verront plus vos messages.
        </p>
        <DeleteAccountForm />
      </Card>
    </>
  );
}
