"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendCentreMessage } from "@/lib/client/portal-actions";
import type { CentreMessageWithSender } from "@/lib/client/portal-actions";

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
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
        setContent(trimmed);
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
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8712A]/10">
              <MessageSquare className="h-6 w-6 text-[#E8712A]" />
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
                      ? "bg-[#E8712A] text-white rounded-br-md"
                      : "bg-white border border-gray-200 text-foreground rounded-bl-md"
                  }`}
                >
                  {!own && (
                    <p className="text-xs font-medium text-[#E8712A] mb-0.5">
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
          className="h-11 w-11 shrink-0 rounded-2xl bg-[#E8712A] hover:bg-[#E8712A]/90 text-white"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
