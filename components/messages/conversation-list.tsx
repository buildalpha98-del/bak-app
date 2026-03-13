"use client";

import { MessageSquare, Plus } from "lucide-react";
import type { ConversationSummary } from "@/lib/messages/actions";
import type { UserRole } from "@/lib/types/enums";

interface ConversationListProps {
  initialConversations: ConversationSummary[];
  selectedId?: string;
  onSelect: (id: string, name: string) => void;
  role: UserRole;
  onNewMessage: () => void;
}

function formatShortTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString("en-AU", { weekday: "short" });
  }
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ConversationList({
  initialConversations,
  selectedId,
  onSelect,
  onNewMessage,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <button
          onClick={onNewMessage}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          New Message
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {initialConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">
              No conversations yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Start a conversation with the team
            </p>
          </div>
        ) : (
          initialConversations.map((convo) => (
            <button
              key={convo.partner_id}
              onClick={() => onSelect(convo.partner_id, convo.partner_name)}
              className={`flex w-full items-center gap-3 p-3 border-b border-border cursor-pointer hover:bg-secondary/50 transition-colors text-left ${
                selectedId === convo.partner_id
                  ? "bg-primary/5 border-l-2 border-l-primary"
                  : ""
              }`}
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                {getInitials(convo.partner_name)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate ${
                      convo.unread_count > 0
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {convo.partner_name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatShortTime(convo.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    className={`text-xs line-clamp-1 ${
                      convo.unread_count > 0
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {convo.last_message === "Message deleted" ? (
                      <span className="italic">Message deleted</span>
                    ) : (
                      convo.last_message
                    )}
                  </p>
                  {convo.unread_count > 0 && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                      {convo.unread_count > 9 ? "9+" : convo.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
