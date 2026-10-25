"use client";

import { useActionState } from "react";
import { linkChild, saveLessonReport, saveParentProfile } from "@/app/actions/progress";
import { Chips } from "@/components/ui/chips";
import { Field, Fieldset, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "./form-bits";

export function AddChildForm() {
  const [state, action] = useActionState(linkChild, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Code de l'enfant" htmlFor="code">
        <Input
          id="code"
          name="code"
          required
          minLength={6}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="Ex. 7KQ4MZ2P"
          className="font-mono tracking-widest uppercase"
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="md">Ajouter</SubmitButton>
    </form>
  );
}

export function ParentProfileForm({
  identity,
  intent,
}: {
  identity: { full_name: string; city: string | null };
  intent: "onboarding" | "edit";
}) {
  const [state, action] = useActionState(saveParentProfile, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="intent" value={intent} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom complet" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={identity.full_name} required minLength={2} />
        </Field>
        <Field label="Ville" htmlFor="city">
          <Input id="city" name="city" defaultValue={identity.city ?? ""} />
        </Field>
      </div>
      {intent === "onboarding" && (
        <Field
          label="Code de votre enfant (facultatif)"
          htmlFor="code"
          hint="Affiché dans Mon profil sur le compte de votre enfant. Vous pourrez l'ajouter plus tard."
        >
          <Input id="code" name="code" maxLength={12} autoCapitalize="characters" autoComplete="off" className="font-mono tracking-widest uppercase" />
        </Field>
      )}
      <FormMessage state={state} />
      <SubmitButton>{intent === "onboarding" ? "Accéder à mon espace parent" : "Enregistrer"}</SubmitButton>
    </form>
  );
}

const engagementOptions = [
  { value: "1", label: "1 · Faible" },
  { value: "2", label: "2" },
  { value: "3", label: "3 · Correcte" },
  { value: "4", label: "4" },
  { value: "5", label: "5 · Excellente" },
];

/** Compte-rendu de séance rédigé par l'enseignant après le cours. */
export function LessonReportForm({ lessonId }: { lessonId: string }) {
  const [state, action] = useActionState(saveLessonReport, {});
  if (state.success) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lesson_id" value={lessonId} />
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <Field label="Note /20" htmlFor={`grade-${lessonId}`} hint="Niveau de maîtrise sur la séance">
          <Input id={`grade-${lessonId}`} name="grade" type="number" min={0} max={20} step={0.5} required inputMode="decimal" />
        </Field>
        <Fieldset legend="Implication">
          <Chips name="engagement" type="radio" required options={engagementOptions} defaultValue="4" />
        </Fieldset>
      </div>
      <Field label="Notions travaillées" htmlFor={`topics-${lessonId}`}>
        <Input id={`topics-${lessonId}`} name="topics" required minLength={3} maxLength={500} placeholder="Ex. dérivées, tableau de variations" />
      </Field>
      <Field label="Travail à faire (facultatif)" htmlFor={`homework-${lessonId}`}>
        <Input id={`homework-${lessonId}`} name="homework" maxLength={500} />
      </Field>
      <Field label="Commentaire pour l'élève et ses parents (facultatif)" htmlFor={`comment-${lessonId}`}>
        <Textarea id={`comment-${lessonId}`} name="comment" maxLength={1500} className="min-h-20" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="md">Enregistrer le compte-rendu</SubmitButton>
    </form>
  );
}
