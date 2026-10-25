import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { ChatThread } from "@/components/chat-thread";
import { LessonForm } from "@/components/forms/lesson-form";
import { LessonItem } from "@/components/lesson-item";
import { SafetyMenu } from "@/components/safety-menu";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, Skeleton } from "@/components/ui/misc";
import { getConversation } from "@/lib/conversations";
import { requireViewer } from "@/lib/data";
import { addDays, nowMs, todayParis } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <div className="container-page py-10">
      <ButtonLink href="/messages" variant="ghost" size="sm" className="-ml-3 mb-4">
        <ArrowLeft className="size-4" /> Messages
      </ButtonLink>
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: Pick<PageProps<"/messages/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await requireViewer();
  const conversation = await getConversation(viewer, id);
  if (!conversation) notFound();
  const { request, other, messages, lessons, blockState } = conversation;
  const firstName = other.name.split(" ")[0]!;
  const closedReason =
    blockState === "by_me"
      ? `Vous avez bloqué ${firstName}. Débloquez-le pour reprendre la conversation.`
      : blockState === "by_other"
        ? "Cette conversation est fermée."
        : undefined;
  const isTeacher = viewer.id === request.teacher_id;
  const now = nowMs();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={other.name} size={44} />
          <div className="flex-1">
            <h1 className="font-semibold">{other.name}</h1>
            <p className="text-sm text-muted">
              {isTeacher ? "Votre élève" : "Votre enseignant"} · <Badge tone="brand">{request.subject}</Badge>
            </p>
          </div>
        </div>
        <SafetyMenu requestId={request.id} otherName={firstName} state={blockState} />
        <ChatThread
          requestId={request.id}
          viewerId={viewer.id}
          otherName={firstName}
          initialMessages={messages}
          closedReason={closedReason}
        />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {!closedReason && (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarPlus className="size-4 text-brand" /> Réserver un cours
            </h2>
            <p className="mt-1 mb-4 text-xs text-muted">
              De 1 h 30 à 2 h. {other.name.split(" ")[0]} devra confirmer le créneau.
            </p>
            <LessonForm requestId={request.id} minDate={addDays(todayParis(), 1)} />
          </Card>
        )}
        {lessons.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Prochains cours</h2>
            <ul className="space-y-2">
              {lessons.map((l) => (
                <LessonItem key={l.id} lesson={l} viewerId={viewer.id} now={now} />
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
