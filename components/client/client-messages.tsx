"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendCentreMessage, getCentreMessages } from "@/lib/client/portal-actions";
import type { CentreMessageWithSender } from "@/lib/client/portal-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface ClientMessagesProps {
  messages: CentreMessageWithSender[];
  centreId: string;
  clientUserId: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function ClientMessages({
  messages: initialMessages,
  centreId,
  clientUserId,
}: ClientMessagesProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Live thread: staff replies appear without a reload. The realtime
  // payload has no joined sender name, so re-fetch through the server
  // action — which also marks the new staff message read, keeping the
  // nav badge honest while the director is looking at the thread.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`client-messages-${centreId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "centre_messages",
          filter: `centre_id=eq.${centreId}`,
        },
        (payload) => {
          const row = payload.new as { sender_type?: string };
          if (row.sender_type !== "staff") return;
          getCentreMessages(centreId).then(({ data }) => {
            if (!data) return;
            // Keep any still-optimistic own message so a staff reply
            // landing mid-send doesn't make the director's text vanish.
            setMessages((prev) => [
              ...data,
              ...prev.filter((m) => m.id.startsWith("temp-")),
            ]);
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [centreId]);

  function handleSend() {
    const trimmed = content.trim();
    if (!trimmed) return;

    // Optimistic update
    const optimisticMessage: CentreMessageWithSender = {
      id: `temp-${Date.now()}`,
      centre_id: centreId,
      sender_type: "client",
      sender_client_id: clientUserId,
      sender_staff_id: null,
      content: trimmed,
      read_at: null,
      created_at: new Date().toISOString(),
      sender_name: "You",
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setContent("");

    startTransition(async () => {
      const { error } = await sendCentreMessage(centreId, trimmed, "client");
      if (error) {
        // Roll back the optimistic message and tell the director —
        // a silently vanishing message reads as "the portal ate it".
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
        setContent(trimmed);
        toast.error("Your message didn't send. Please try again.");
      }
    });

    // Refocus input after send
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isOwnMessage = (msg: CentreMessageWithSender) =>
    msg.sender_type === "client" && msg.sender_client_id === clientUserId;

  return (
    <div className="animate-fade-up flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100dvh-5rem)]">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold font-heading text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat with Build Alpha Kids
        </p>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-2xl border bg-gray-50 p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-portal-600/10">
              <MessageSquare className="h-6 w-6 text-portal-600" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              No messages yet
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Send a message to get in touch with Build Alpha Kids.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const own = isOwnMessage(msg);
            return (
              <div
                key={msg.id}
                className={`flex ${own ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 ${
                    own
                      ? "bg-portal-600 text-white rounded-br-md"
                      : "bg-card border border-gray-200 text-foreground rounded-bl-md"
                  }`}
                >
                  {!own && (
                    <p className="text-xs font-medium text-portal-600 mb-0.5">
                      {msg.sender_name}
                    </p>
                  )}
                  <p className={`text-sm whitespace-pre-wrap break-words ${own ? "text-white" : "text-foreground"}`}>
                    {msg.content}
                  </p>
                  <p
                    className={`text-[11px] mt-1 ${
                      own ? "text-white/80" : "text-muted-foreground"
                    }`}
                  >
                    {formatRelativeTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input bar */}
      <div className="mt-3 flex items-center gap-2 shrink-0">
        <Input
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isPending}
          className="flex-1 min-h-[44px]"
          aria-label="Message content"
        />
        <Button
          onClick={handleSend}
          disabled={isPending || !content.trim()}
          size="icon"
          className="h-11 w-11 shrink-0 rounded-2xl bg-portal-600 hover:bg-portal-600/90 text-white"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
