import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/forms/auth-form";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Connexion" };

export default function SignInPage({ searchParams }: PageProps<"/connexion">) {
  return (
    <AuthShell
      title="Bon retour 👋"
      subtitle={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-brand hover:underline">
            Inscrivez-vous
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/connexion">, "searchParams">) {
  const { next, erreur } = await searchParams;
  return (
    <>
      {erreur === "lien" && (
        <p className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Ce lien est invalide ou a expiré. Connectez-vous ou recommencez l&apos;inscription.
        </p>
      )}
      <SignInForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
