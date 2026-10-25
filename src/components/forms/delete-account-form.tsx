"use client";

import { useActionState, useState } from "react";
import { deleteAccount } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "./form-bits";

export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAccount, {});
  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Supprimer mon compte
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm">
        Votre profil, vos demandes, messages, cours et avis seront <strong>définitivement supprimés</strong>. Cette action est
        irréversible.
      </p>
      <Field label="Tapez SUPPRIMER pour confirmer" htmlFor="confirm">
        <Input id="confirm" name="confirm" autoComplete="off" autoCapitalize="characters" required />
      </Field>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Annuler
        </Button>
        <SubmitButton size="md" className="bg-danger hover:bg-danger/90">
          Supprimer définitivement
        </SubmitButton>
      </div>
    </form>
  );
}
