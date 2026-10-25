"use client";

import { useActionState, type ReactNode } from "react";
import { saveStudentProfile, saveTeacherProfile } from "@/app/actions/profile";
import { Chips } from "@/components/ui/chips";
import { Field, Fieldset, Input, Select, Textarea } from "@/components/ui/field";
import { LEVELS, MODES, SUBJECTS } from "@/lib/constants";
import type { StudentProfile, TeacherProfile } from "@/lib/types";
import { AvailabilityGrid } from "./availability-grid";
import { FormMessage, SubmitButton } from "./form-bits";

type Identity = { full_name: string; city: string | null };
type Intent = "onboarding" | "edit";

const levelOptions = LEVELS.map((l) => ({ value: l.value, label: l.label }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5 border-t border-border pt-6 first:border-0 first:pt-0">
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function IdentityFields({ identity }: { identity: Identity }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nom complet" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={identity.full_name} required minLength={2} />
      </Field>
      <Field label="Ville" htmlFor="city" hint="Utile pour les cours en présentiel">
        <Input id="city" name="city" defaultValue={identity.city ?? ""} placeholder="Lyon" />
      </Field>
    </div>
  );
}

export function StudentProfileForm({
  identity,
  profile,
  intent,
}: {
  identity: Identity;
  profile: StudentProfile | null;
  intent: Intent;
}) {
  const [state, action] = useActionState(saveStudentProfile, {});
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="intent" value={intent} />
      <Section title="Vous">
        <IdentityFields identity={identity} />
      </Section>

      <Section title="Votre scolarité">
        <Fieldset legend="Niveau">
          <Chips name="level" type="radio" required options={levelOptions} defaultValue={profile?.level ?? "lycee"} />
        </Fieldset>
        <Field label="Classe / filière" htmlFor="grade">
          <Select id="grade" name="grade" defaultValue={profile?.grade ?? ""}>
            <option value="">Choisir…</option>
            {LEVELS.map((l) => (
              <optgroup key={l.value} label={l.label}>
                {l.grades.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Fieldset legend="Matières où vous cherchez de l'aide">
          <Chips name="subjects" options={SUBJECTS} defaultValue={profile?.subjects ?? []} />
        </Fieldset>
        <Field label="Vos objectifs" htmlFor="goals" hint="Ex. : préparer le bac, combler des lacunes en analyse, viser une école d'ingénieur…">
          <Textarea id="goals" name="goals" defaultValue={profile?.goals ?? ""} maxLength={1000} />
        </Field>
      </Section>

      <Section title="Organisation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Budget maximum (€/h)" htmlFor="budget_max">
            <Input id="budget_max" name="budget_max" type="number" min={5} max={500} defaultValue={profile?.budget_max ?? 35} required />
          </Field>
        </div>
        <Fieldset legend="Format des cours">
          <Chips name="mode" type="radio" required options={MODES} defaultValue={profile?.mode ?? "both"} />
        </Fieldset>
        <Fieldset legend="Disponibilités" hint="Sélectionnez les créneaux qui vous conviennent.">
          <AvailabilityGrid defaultValue={profile?.availability} />
        </Fieldset>
      </Section>

      <FormMessage state={state} />
      <SubmitButton>{intent === "onboarding" ? "Voir mes enseignants recommandés" : "Enregistrer"}</SubmitButton>
    </form>
  );
}

export function TeacherProfileForm({
  identity,
  profile,
  intent,
}: {
  identity: Identity;
  profile: TeacherProfile | null;
  intent: Intent;
}) {
  const [state, action] = useActionState(saveTeacherProfile, {});
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="intent" value={intent} />
      <Section title="Vous">
        <IdentityFields identity={identity} />
        <Field label="Accroche" htmlFor="headline" hint="Une phrase qui résume votre approche.">
          <Input
            id="headline"
            name="headline"
            defaultValue={profile?.headline ?? ""}
            placeholder="Professeur agrégé de mathématiques, spécialiste de la prépa"
            maxLength={120}
            required
          />
        </Field>
        <Field label="Présentation" htmlFor="bio">
          <Textarea
            id="bio"
            name="bio"
            defaultValue={profile?.bio ?? ""}
            placeholder="Votre parcours, votre pédagogie, ce qu'un élève peut attendre d'un cours avec vous…"
            className="min-h-40"
            minLength={50}
            maxLength={3000}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Diplômes" htmlFor="diplomas">
            <Input id="diplomas" name="diplomas" defaultValue={profile?.diplomas ?? ""} placeholder="Agrégation, Master MEEF…" />
          </Field>
          <Field label="Années d'expérience" htmlFor="years_experience">
            <Input id="years_experience" name="years_experience" type="number" min={0} max={60} defaultValue={profile?.years_experience ?? 0} />
          </Field>
        </div>
      </Section>

      <Section title="Enseignement">
        <Fieldset legend="Matières enseignées">
          <Chips name="subjects" options={SUBJECTS} defaultValue={profile?.subjects ?? []} />
        </Fieldset>
        <Fieldset legend="Niveaux">
          <Chips name="levels" options={levelOptions} defaultValue={profile?.levels ?? []} />
        </Fieldset>
        <Fieldset legend="Format des cours">
          <Chips name="mode" type="radio" required options={MODES} defaultValue={profile?.mode ?? "both"} />
        </Fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tarif horaire (€)" htmlFor="hourly_rate">
            <Input id="hourly_rate" name="hourly_rate" type="number" min={5} max={500} defaultValue={profile?.hourly_rate ?? 30} required />
          </Field>
        </div>
        <Fieldset legend="Disponibilités">
          <AvailabilityGrid defaultValue={profile?.availability} />
        </Fieldset>
      </Section>

      <Section title="Visibilité">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border p-4">
          <span>
            <span className="block text-sm font-medium">Profil visible dans l&apos;annuaire</span>
            <span className="block text-xs text-muted">Désactivez-le pour mettre vos demandes en pause.</span>
          </span>
          <input type="checkbox" name="is_published" defaultChecked={profile?.is_published ?? true} className="peer sr-only" />
          <span className="relative h-6 w-11 shrink-0 rounded-full bg-surface-muted transition peer-checked:bg-brand after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20" />
        </label>
      </Section>

      <FormMessage state={state} />
      <SubmitButton>{intent === "onboarding" ? "Publier mon profil" : "Enregistrer"}</SubmitButton>
    </form>
  );
}
