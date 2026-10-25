import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/forms/auth-form";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Inscription" };

export default function SignUpPage({ searchParams }: PageProps<"/inscription">) {
  return (
    <AuthShell
      title="Créer un compte"
      subtitle={
        <>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-brand hover:underline">
            Connectez-vous
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/inscription">, "searchParams">) {
  const { role } = await searchParams;
  return <SignUpForm defaultRole={role === "teacher" ? "teacher" : "student"} />;
}
