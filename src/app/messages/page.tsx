import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { listConversations } from "@/lib/conversations";
import { requireViewer } from "@/lib/data";
import { formatMessageDate } from "@/lib/time";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
      <p className="mt-1 text-muted">Échangez avec vos élèves et enseignants, et organisez vos cours.</p>
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Conversations />
        </Suspense>
      </div>
    </div>
  );
}

async function Conversations() {
  const viewer = await requireViewer();
  const conversations = await listConversations(viewer);

  if (conversations.length === 0) {
    return (
      <EmptyState icon={<MessagesSquare className="size-5" />} title="Aucune conversation">
        {viewer.profile.role === "teacher"
          ? "Acceptez une demande d'élève pour ouvrir une conversation."
          : "Une conversation s'ouvre dès qu'un enseignant accepte votre demande."}
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
      {conversations.map((c) => {
        const last = c.last_message;
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className="flex items-center gap-4 p-4 transition hover:bg-surface-muted sm:p-5">
              <Avatar name={c.other.name} size={46} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.other.name}</span>
                  <Badge tone="brand">{c.subject}</Badge>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {last ? `${last.sender_id === viewer.id ? "Vous : " : ""}${last.body}` : "Nouvelle conversation, dites bonjour !"}
                </p>
              </div>
              {last && <span className="shrink-0 text-xs text-muted">{formatMessageDate(last.created_at)}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
