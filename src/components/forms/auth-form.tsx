"use client";

import { useActionState } from "react";
import { GraduationCap, School } from "lucide-react";
import { signIn, signUp } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "./form-bits";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Se connecter</SubmitButton>
    </form>
  );
}

export function SignUpForm({ defaultRole }: { defaultRole: "student" | "teacher" }) {
  const [state, action] = useActionState(signUp, {});
  const roles = [
    { value: "student", label: "Je suis élève", desc: "Collège, lycée, prépa, fac", Icon: GraduationCap },
    { value: "teacher", label: "Je suis enseignant", desc: "Je partage mon expertise", Icon: School },
  ] as const;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {roles.map(({ value, label, desc, Icon }) => (
          <label key={value} className="cursor-pointer">
            <input type="radio" name="role" value={value} defaultChecked={value === defaultRole} className="peer sr-only" />
            <span className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:ring-4 peer-checked:ring-brand/10 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20">
              <Icon className="size-5 text-brand" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted">{desc}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Nom complet" htmlFor="full_name">
        <Input id="full_name" name="full_name" autoComplete="name" required minLength={2} />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password" hint="8 caractères minimum">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Créer mon compte</SubmitButton>
    </form>
  );
}
