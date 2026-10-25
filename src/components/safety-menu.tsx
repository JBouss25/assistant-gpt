"use client";

import { useActionState, useState } from "react";
import { Ban, Flag } from "lucide-react";
import { blockUser, reportUser, unblockUser } from "@/app/actions/moderation";
import { FormMessage, SubmitButton } from "@/components/forms/form-bits";
import { Textarea } from "@/components/ui/field";
import { Button } from "./ui/button";

export type BlockState = "none" | "by_me" | "by_other";

/** Signaler / bloquer l'interlocuteur d'une conversation. */
export function SafetyMenu({ requestId, otherName, state }: { requestId: string; otherName: string; state: BlockState }) {
  const [panel, setPanel] = useState<"report" | "block" | null>(null);
  const [report, reportAction] = useActionState(reportUser, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "report" ? null : "report")}>
          <Flag className="size-4" /> Signaler
        </Button>
        {state === "by_me" ? (
          <form action={unblockUser}>
            <input type="hidden" name="request_id" value={requestId} />
            <Button size="sm" variant="secondary" type="submit">
              Débloquer {otherName}
            </Button>
          </form>
        ) : (
          state === "none" && (
            <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "block" ? null : "block")}>
              <Ban className="size-4" /> Bloquer
            </Button>
          )
        )}
      </div>

      {panel === "report" && (
        <form action={reportAction} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <input type="hidden" name="request_id" value={requestId} />
          <p className="text-sm font-medium">Signaler {otherName}</p>
          {!report.success && (
            <Textarea name="reason" required minLength={10} maxLength={1000} placeholder="Que s'est-il passé ?" className="min-h-24" />
          )}
          <FormMessage state={report} />
          {!report.success && <SubmitButton size="sm">Envoyer le signalement</SubmitButton>}
        </form>
      )}

      {panel === "block" && (
        <form action={blockUser} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <input type="hidden" name="request_id" value={requestId} />
          <p className="text-sm">
            {otherName} ne pourra plus vous écrire, vous proposer de cours ni vous envoyer de demande. Vous pourrez le débloquer à
            tout moment.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setPanel(null)}>
              Annuler
            </Button>
            <SubmitButton size="sm" className="bg-danger hover:bg-danger/90">
              Bloquer
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
