"use client";

import { useActionState } from "react";
import { proposeLesson } from "@/app/actions/messaging";
import { Chips } from "@/components/ui/chips";
import { Field, Fieldset, Input, Select, Textarea } from "@/components/ui/field";
import { DURATIONS, START_TIMES } from "@/lib/time";
import { FormMessage, SubmitButton } from "./form-bits";

const durationOptions = DURATIONS.map((d) => ({ value: String(d.value), label: d.label }));

/** Proposer un cours de 1 h 30 à 2 h. */
export function LessonForm({
  requestId,
  partners,
  minDate,
}: {
  /** Conversation fixe (page de discussion)… */
  requestId?: string;
  /** …ou liste des personnes avec qui réserver (calendrier). */
  partners?: { requestId: string; label: string }[];
  minDate: string;
}) {
  const [state, action] = useActionState(proposeLesson, {});
  return (
    <form action={action} className="space-y-4">
      {requestId ? (
        <input type="hidden" name="request_id" value={requestId} />
      ) : (
        <Field label="Avec" htmlFor="request_id">
          <Select id="request_id" name="request_id" required defaultValue="">
            <option value="" disabled>
              Choisir…
            </option>
            {partners?.map((p) => (
              <option key={p.requestId} value={p.requestId}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="date">
          <Input id="date" name="date" type="date" min={minDate} defaultValue={minDate} required />
        </Field>
        <Field label="Début" htmlFor="time">
          <Select id="time" name="time" defaultValue="17:00" required>
            {START_TIMES.map((t) => (
              <option key={t} value={t}>
                {t.replace(":", " h ")}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Fieldset legend="Durée">
        <Chips name="duration" type="radio" required options={durationOptions} defaultValue="90" />
      </Fieldset>
      <Field label="Note (optionnel)" htmlFor="note">
        <Textarea id="note" name="note" maxLength={500} className="min-h-20" placeholder="Chapitre à travailler, lien visio, adresse…" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="md" className="w-full">
        Proposer ce créneau
      </SubmitButton>
    </form>
  );
}
