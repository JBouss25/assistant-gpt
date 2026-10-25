import { RefreshCw, X } from "lucide-react";
import { regenerateParentCode, unlinkFamily } from "@/app/actions/progress";
import { Button } from "./ui/button";
import { Avatar, Card } from "./ui/misc";

function UnlinkButton({ otherId, label }: { otherId: string; label: string }) {
  return (
    <form action={unlinkFamily}>
      <input type="hidden" name="other_id" value={otherId} />
      <Button type="submit" size="sm" variant="ghost" aria-label={label} title={label} className="px-2">
        <X className="size-4" />
      </Button>
    </form>
  );
}

/** Profil élève : code à donner aux parents + parents reliés. */
export function ParentCodeCard({ code, parents }: { code: string | null; parents: { id: string; name: string }[] }) {
  return (
    <Card className="mt-6 sm:p-8">
      <h2 className="font-semibold">Code parent</h2>
      <p className="mt-1 text-sm text-muted">
        Donnez ce code à vos parents : ils pourront suivre vos cours, vos notes et les comptes-rendus de vos enseignants. Ils
        ne peuvent ni lire vos messages ni écrire à votre place.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-2xl bg-surface-muted px-4 py-2 font-mono text-xl tracking-[0.3em]">{code ?? "—"}</span>
        <form action={regenerateParentCode}>
          <Button type="submit" size="sm" variant="secondary">
            <RefreshCw className="size-4" /> Nouveau code
          </Button>
        </form>
      </div>
      {parents.length > 0 && (
        <ul className="mt-5 space-y-2">
          {parents.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <Avatar name={p.name} size={32} />
              <span className="flex-1 text-sm">{p.name}</span>
              <UnlinkButton otherId={p.id} label={`Retirer ${p.name}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Profil parent : enfants reliés. */
export function ChildrenCard({ students }: { students: { id: string; name: string }[] }) {
  if (students.length === 0) return null;
  return (
    <Card className="mt-6 sm:p-8">
      <h2 className="font-semibold">Mes enfants</h2>
      <ul className="mt-4 space-y-2">
        {students.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <Avatar name={s.name} size={32} />
            <span className="flex-1 text-sm">{s.name}</span>
            <UnlinkButton otherId={s.id} label={`Ne plus suivre ${s.name}`} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
