"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { LoaderCircle, SendHorizontal } from "lucide-react";
import { sendMessage } from "@/app/actions/messaging";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatMessageDate, formatTime, parisParts, todayParis } from "@/lib/time";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

function sortUnique(list: Message[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ChatThread({
  requestId,
  viewerId,
  otherName,
  initialMessages,
}: {
  requestId: string;
  viewerId: string;
  otherName: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const latest = useRef(initialMessages.at(-1)?.created_at ?? new Date(0).toISOString());

  // Nouveaux messages en temps réel (Supabase Realtime, filtré par RLS).
  useEffect(() => {
    const supabase = getBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    (async () => {
      // Le jeton doit être transmis avant l'abonnement, sinon la RLS voit un visiteur anonyme.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`messages:${requestId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` },
          (payload: RealtimePostgresInsertPayload<Message>) =>
            setMessages((prev) => sortUnique([...prev, payload.new])),
        )
        .subscribe(async (status: string) => {
          if (status !== "SUBSCRIBED" || cancelled) return;
          // Rattrape les messages arrivés entre le rendu serveur et l'abonnement.
          const { data: missed } = await supabase
            .from("messages")
            .select("*")
            .eq("request_id", requestId)
            .gt("created_at", latest.current)
            .order("created_at");
          if (!cancelled && missed?.length) setMessages((prev) => sortUnique([...prev, ...(missed as Message[])]));
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [requestId]);

  useEffect(() => {
    latest.current = messages.at(-1)?.created_at ?? latest.current;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    setError(undefined);
    startTransition(async () => {
      const res = await sendMessage(requestId, body);
      if (res.message) {
        setMessages((prev) => sortUnique([...prev, res.message!]));
        setDraft("");
      } else {
        setError(res.error);
      }
    });
  }

  const today = todayParis();

  return (
    <div className="flex h-[min(70vh,44rem)] flex-col overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-16 text-center text-sm text-muted">
            Démarrez la conversation avec {otherName} : présentez vos objectifs et proposez un premier créneau.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === viewerId;
          const prev = messages[i - 1];
          const grouped = prev && prev.sender_id === m.sender_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60000;
          const sameDay = parisParts(new Date(m.created_at)).date === today;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start", !grouped && i > 0 && "pt-3")}>
              <p
                className={cn(
                  "max-w-[85%] rounded-3xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words sm:max-w-[70%]",
                  mine ? "rounded-br-lg bg-brand text-white" : "rounded-bl-lg bg-surface-muted",
                )}
              >
                {m.body}
              </p>
              {!grouped && (
                <span className="mt-1 px-2 text-[11px] text-muted">
                  {sameDay ? formatTime(m.created_at) : formatMessageDate(m.created_at)}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-border p-3"
      >
        {error && <p className="px-2 pb-2 text-xs text-danger">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={`Écrire à ${otherName}…`}
            aria-label="Votre message"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Envoyer"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong disabled:opacity-40"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
