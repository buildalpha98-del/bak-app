"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getConversations, type ConversationSummary } from "@/lib/messages/actions";
import { ConversationList } from "@/components/messages/conversation-list";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import type { UserRole } from "@/lib/types/enums";

interface MessagesPageClientProps {
  initialConversations: ConversationSummary[];
  currentUserId: string;
  role: UserRole;
}

export function MessagesPageClient({
  initialConversations,
  currentUserId,
  role,
}: MessagesPageClientProps) {
  const searchParams = useSearchParams();
  const coachParam = searchParams.get("coach");

  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  // Refresh conversations from server
  const refreshConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      setConversations(data);
      return data;
    } catch {
      return conversations;
    }
  }, [conversations]);

  // Handle ?coach=ID deep link on initial load
  useEffect(() => {
    if (!coachParam) return;

    const existing = initialConversations.find(
      (c) => c.partner_id === coachParam
    );
    if (existing) {
      setSelectedConversation({
        id: existing.partner_id,
        name: existing.partner_name,
      });
    } else {
      // New conversation with this user — default name based on role
      const fallbackName = role === "coach" ? "Team" : "Coach";
      setSelectedConversation({ id: coachParam, name: fallbackName });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectConversation = (id: string, name: string) => {
    setSelectedConversation({ id, name });

    // Clear unread count in local state immediately
    setConversations((prev) =>
      prev.map((c) =>
        c.partner_id === id ? { ...c, unread_count: 0 } : c
      )
    );
  };

  const handleNewMessageSelect = (id: string, name: string) => {
    setSelectedConversation({ id, name });
    setNewMessageOpen(false);
  };

  const handleBack = () => {
    setSelectedConversation(null);
    // Refresh conversations to update last messages and unread counts
    refreshConversations();
  };

  // Subtitle text varies by role
  const subtitle =
    role === "coach"
      ? "Direct messages with the team"
      : "Direct messages with coaches";

  return (
    <div>
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Messages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Desktop: side-by-side layout */}
        <div className="hidden md:flex h-[calc(100vh-12rem)]">
          {/* Sidebar — 320px conversation list */}
          <div className="w-80 border-r border-border shrink-0 overflow-hidden">
            <ConversationList
              initialConversations={conversations}
              selectedId={selectedConversation?.id}
              onSelect={handleSelectConversation}
              role={role}
              onNewMessage={() => setNewMessageOpen(true)}
            />
          </div>

          {/* Thread area */}
          <div className="flex-1 min-w-0">
            {selectedConversation ? (
              <ConversationThread
                key={selectedConversation.id}
                otherUserId={selectedConversation.id}
                otherUserName={selectedConversation.name}
                currentUserId={currentUserId}
              />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* Mobile: show one or the other */}
        <div className="md:hidden h-[calc(100vh-12rem)]">
          {selectedConversation ? (
            <ConversationThread
              key={selectedConversation.id}
              otherUserId={selectedConversation.id}
              otherUserName={selectedConversation.name}
              currentUserId={currentUserId}
              onBack={handleBack}
            />
          ) : (
            <ConversationList
              initialConversations={conversations}
              onSelect={handleSelectConversation}
              role={role}
              onNewMessage={() => setNewMessageOpen(true)}
            />
          )}
        </div>
      </div>

      <NewMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        onSelect={handleNewMessageSelect}
      />
    </div>
  );
}

/** Empty state shown when no conversation is selected (desktop only) */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
        <MessageSquare className="h-7 w-7 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">
        Select a conversation
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Choose a conversation from the sidebar or start a new one
      </p>
    </div>
  );
}
