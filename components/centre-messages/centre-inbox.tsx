"use client";

// ============================================================
// Centre inbox — staff side of client-portal messaging
// ============================================================
//
// Two-pane inbox: centre threads on the left (unread badges, latest
// snippet), the selected conversation on the right with a reply box.
// Selection persists via ?centre= so refreshes and shared links land
// on the same thread. Opening a thread marks its client messages read
// (server-side, in getCentreThread).

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Building2, Inbox, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  sendStaffCentreMessage,
  type CentreThreadSummary,
  type CentreThreadMessage,
} from "@/lib/centre-messages/actions";

interface Props {
  threads: CentreThreadSummary[];
  selectedCentreId: string | null;
  thread: { centreName: string; messages: CentreThreadMessage[] } | null;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function CentreInbox({ threads, selectedCentreId, thread }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pin to the latest message whenever the thread changes.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread?.messages.length, selectedCentreId]);

  useEffect(() => {
    // Live inbox: any new centre message (any centre — the thread list
    // and unread badges need it too) re-fetches the server data.
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("centre-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "centre_messages" },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  function selectCentre(centreId: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("centre", centreId);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  function handleSend() {
    if (!selectedCentreId || !draft.trim()) return;
    const content = draft;
    setDraft("");
    startTransition(async () => {
      const { error } = await sendStaffCentreMessage(selectedCentreId, content);
      if (error) {
        toast.error(error);
        setDraft(content);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid min-h-[60vh] grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
      {/* Thread list */}
      <Card className="overflow-hidden rounded-2xl">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">
              No centre messages yet. When a director messages you from
              their portal, the thread appears here.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {threads.map((t) => {
              const active = t.centre_id === selectedCentreId;
              return (
                <li key={t.centre_id}>
                  <button
                    type="button"
                    onClick={() => selectCentre(t.centre_id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition hover:bg-secondary/60",
                      active && "border-l-2 border-[#E8712A] bg-secondary/60"
                    )}
                  >
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-sm text-foreground",
                            t.unread_count > 0 ? "font-semibold" : "font-medium"
                          )}
                        >
                          {t.centre_name}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeLabel(t.last_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.last_sender === "staff" ? "You: " : ""}
                        {t.last_message}
                      </p>
                    </div>
                    {t.unread_count > 0 && (
                      <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#E8712A] px-1.5 text-[11px] font-semibold text-white">
                        {t.unread_count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Conversation */}
      <Card className="flex flex-col overflow-hidden rounded-2xl">
        {!thread ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">
              Select a centre to read the conversation.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {thread.centreName}
              </p>
              <p className="text-xs text-muted-foreground">
                Replies land in the centre director&apos;s portal instantly.
              </p>
            </div>

            <div
              ref={scrollRef}
              className="flex max-h-[52vh] flex-1 flex-col gap-2.5 overflow-y-auto p-4"
            >
              {thread.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.sender_type === "staff"
                      ? "self-end rounded-br-md bg-[#E8712A] text-white"
                      : "self-start rounded-bl-md border bg-white text-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      m.sender_type === "staff"
                        ? "text-white/75"
                        : "text-muted-foreground"
                    )}
                  >
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              ))}
              {thread.messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No messages in this thread yet.
                </p>
              )}
            </div>

            <div className="flex items-end gap-2 border-t p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                placeholder="Reply to the centre… (Enter to send)"
                className="min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#E8712A]/40"
              />
              <Button
                onClick={handleSend}
                disabled={isPending || !draft.trim()}
                className="h-11 bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
