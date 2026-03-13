"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare } from "lucide-react";
import { addShiftThreadMessage } from "@/lib/sessions/coach-actions";
import type { ShiftThreadMessage } from "@/lib/sessions/coach-actions";

// ============================================================
// Helpers
// ============================================================

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

// ============================================================
// Props
// ============================================================

interface ShiftThreadProps {
  sessionId: string;
  messages: ShiftThreadMessage[];
  currentUserId: string;
}

// ============================================================
// Component
// ============================================================

export function ShiftThread({
  sessionId,
  messages,
  currentUserId,
}: ShiftThreadProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed) return;

    setContent("");
    startTransition(async () => {
      const result = await addShiftThreadMessage(sessionId, trimmed);
      if (result.error) {
        setContent(trimmed); // Restore on failure
      }
      router.refresh();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">
          Shift Discussion
        </h3>
        {messages.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({messages.length})
          </span>
        )}
      </div>

      {/* Messages */}
      {messages.length > 0 ? (
        <div
          ref={scrollRef}
          className="max-h-60 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3"
        >
          {messages.map((msg) => {
            const isOwn = msg.user_id === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    isOwn
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border text-foreground"
                  }`}
                >
                  {!isOwn && (
                    <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                      {msg.author_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {timeAgo(msg.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No messages yet. Start a discussion about this shift.
        </p>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!content.trim() || isPending}
          className="shrink-0 bg-primary hover:bg-primary/90 min-h-[44px] min-w-[44px]"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
