"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, SendHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getConversationMessages,
  sendDirectMessage,
  editDirectMessage,
  deleteDirectMessage,
} from "@/lib/messages/actions";
import { MessageBubble } from "./message-bubble";
import type { DirectMessage } from "@/lib/types/database";

interface ConversationThreadProps {
  otherUserId: string;
  otherUserName: string;
  currentUserId: string;
  onBack?: () => void;
}

export function ConversationThread({
  otherUserId,
  otherUserName,
  currentUserId,
  onBack,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldScrollRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Fetch messages on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchMessages() {
      setLoading(true);
      try {
        const result = await getConversationMessages(otherUserId);
        if (!cancelled) {
          setMessages(result.data);
          setHasMore(result.hasMore);
          shouldScrollRef.current = true;
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        toast.error("Failed to load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMessages();
    return () => {
      cancelled = true;
    };
  }, [otherUserId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channelId = `dm-${[currentUserId, otherUserId].sort().join("-")}`;

    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `sender_id=eq.${otherUserId}`,
        },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          // Only add if it's for this conversation
          if (newMsg.recipient_id === currentUserId) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            shouldScrollRef.current = true;

            // Mark as read in the background
            getConversationMessages(otherUserId).catch(() => {});
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const updated = payload.new as DirectMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, otherUserId]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = 4 * 24; // ~4 rows
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        maxHeight
      )}px`;
    }
  }, [inputValue]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || sending) return;

    setSending(true);
    shouldScrollRef.current = true;

    try {
      const newMessage = await sendDirectMessage(otherUserId, trimmed);
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      setInputValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send message"
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEdit = async (id: string, content: string) => {
    try {
      const updated = await editDirectMessage(id, content);
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      toast.success("Message updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to edit message"
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDirectMessage(id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                content: null,
                deleted_at: new Date().toISOString(),
              }
            : m
        )
      );
      toast.success("Message deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete message"
      );
    }
  };

  const handleLoadOlder = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    shouldScrollRef.current = false;

    try {
      const oldest = messages[0];
      const result = await getConversationMessages(
        otherUserId,
        oldest.created_at
      );
      setMessages((prev) => [...result.data, ...prev]);
      setHasMore(result.hasMore);
    } catch {
      toast.error("Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  };

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-secondary/50 transition-colors md:hidden min-h-[44px] min-w-[44px]"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
          {getInitials(otherUserName)}
        </div>
        <h2 className="text-sm font-semibold text-foreground">
          {otherUserName}
        </h2>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={handleLoadOlder}
                  disabled={loadingMore}
                  className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50 min-h-[44px] px-4"
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Load older messages"
                  )}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No messages yet. Say hello!
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender_id === currentUserId}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            maxLength={2000}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[44px]"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px]"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
