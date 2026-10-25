"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { createRequest } from "@/app/actions/requests";
import { saveReview } from "@/app/actions/reviews";
import { Field, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { FormMessage, SubmitButton } from "./form-bits";

export function RequestForm({
  teacherId,
  subjects,
  defaultSubject,
}: {
  teacherId: string;
  subjects: string[];
  defaultSubject?: string;
}) {
  const [state, action] = useActionState(createRequest, {});
  if (state.success) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teacher_id" value={teacherId} />
      <Field label="Matière" htmlFor="subject">
        <Select id="subject" name="subject" defaultValue={defaultSubject ?? subjects[0]} required>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <Field label="Votre message" htmlFor="message">
        <Textarea
          id="message"
          name="message"
          required
          minLength={20}
          maxLength={2000}
          placeholder="Bonjour, je suis en Terminale et j'aimerais progresser en mécanique avant le bac…"
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="md">
        Envoyer ma demande
      </SubmitButton>
    </form>
  );
}

export function ReviewForm({
  teacherId,
  defaultRating = 0,
  defaultComment = "",
}: {
  teacherId: string;
  defaultRating?: number;
  defaultComment?: string;
}) {
  const [state, action] = useActionState(saveReview, {});
  const [rating, setRating] = useState(defaultRating);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teacher_id" value={teacherId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Note">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sur 5`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            className="rounded p-0.5 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Star className={cn("size-7 transition", n <= shown ? "fill-amber-400 text-amber-400" : "text-border")} />
          </button>
        ))}
      </div>
      <Textarea name="comment" defaultValue={defaultComment} maxLength={1000} placeholder="Qu'avez-vous pensé des cours ?" />
      <FormMessage state={state} />
      <SubmitButton size="md">{defaultRating ? "Mettre à jour mon avis" : "Publier mon avis"}</SubmitButton>
    </form>
  );
}
