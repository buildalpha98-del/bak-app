"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Send,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  Reply,
  ChevronDown,
} from "lucide-react";
import {
  addShiftThreadMessage,
  editShiftThreadMessage,
  deleteShiftThreadMessage,
} from "@/lib/sessions/coach-actions";
import type { ShiftThreadMessage } from "@/lib/sessions/coach-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ============================================================
// Helpers
// ============================================================

/** Returns a human-readable relative time string in Australian English. */
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
// Sub-components
// ============================================================

interface MessageBubbleProps {
  msg: ShiftThreadMessage;
  isOwn: boolean;
  currentUserId: string;
  onReply: (messageId: string) => void;
  onStartEdit: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  editingId: string | null;
  editContent: string;
  setEditContent: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  deletingId: string | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  isEditPending: boolean;
  isDeletePending: boolean;
  replyCount: number;
  expandedThreadId: string | null;
  onToggleThread: (messageId: string) => void;
  isTopLevel: boolean;
}

function MessageBubble({
  msg,
  isOwn,
  onReply,
  onStartEdit,
  onDelete,
  editingId,
  editContent,
  setEditContent,
  onSaveEdit,
  onCancelEdit,
  deletingId,
  onConfirmDelete,
  onCancelDelete,
  isEditPending,
  isDeletePending,
  replyCount,
  expandedThreadId,
  onToggleThread,
  isTopLevel,
}: MessageBubbleProps) {
  const isDeleted = msg.deleted_at !== null;
  const isEditing = editingId === msg.id;
  const isDeleting = deletingId === msg.id;
  const isEdited = msg.updated_at !== null && !isDeleted;

  /** Handle keyboard shortcuts in the edit textarea. */
  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSaveEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
    }
  }

  // Deleted message display
  if (isDeleted) {
    return (
      <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted/30 border border-border">
          <p className="italic text-muted-foreground text-xs">
            This message was deleted
          </p>
        </div>
        <span className="mt-0.5 text-[10px] text-muted-foreground/70">
          {timeAgo(msg.created_at)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`group flex flex-col ${isOwn ? "items-end" : "items-start"}`}
    >
      <div className="relative max-w-[85%]">
        {/* Hover / long-press actions for own messages */}
        {isOwn && !isEditing && !isDeleting && (
          <div className="absolute -top-2 right-0 hidden group-hover:flex items-center gap-0.5 rounded-md border border-border bg-card px-1 py-0.5 shadow-sm z-10">
            <button
              onClick={() => onStartEdit(msg.id)}
              className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors sm:p-1 sm:min-h-0 sm:min-w-0"
              aria-label="Edit message"
            >
              <Pencil className="size-3.5 sm:size-3" />
            </button>
            <button
              onClick={() => onDelete(msg.id)}
              className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors sm:p-1 sm:min-h-0 sm:min-w-0"
              aria-label="Delete message"
            >
              <Trash2 className="size-3.5 sm:size-3" />
            </button>
          </div>
        )}

        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground"
          }`}
        >
          {/* Author name for non-own messages */}
          {!isOwn && (
            <p className="mb-0.5 text-xs font-medium text-foreground">
              {msg.author_name}
            </p>
          )}

          {/* Edit mode */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={2}
                className="w-full resize-none rounded border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                autoFocus
              />
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={onCancelEdit}
                  className="flex items-center gap-1 rounded px-2 py-1 min-h-[44px] text-xs text-muted-foreground hover:bg-muted transition-colors sm:min-h-0 sm:py-0.5"
                  disabled={isEditPending}
                >
                  <X className="size-3" />
                  Cancel
                </button>
                <button
                  onClick={onSaveEdit}
                  className="flex items-center gap-1 rounded px-2 py-1 min-h-[44px] text-xs bg-primary/20 text-primary hover:bg-primary/30 transition-colors sm:min-h-0 sm:py-0.5"
                  disabled={isEditPending || !editContent.trim()}
                >
                  <CheckCircle2 className="size-3" />
                  Save
                </button>
              </div>
            </div>
          ) : isDeleting ? (
            /* Delete confirmation */
            <div className="space-y-2">
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <div className="flex items-center gap-1 justify-end border-t border-border/30 pt-1">
                <span className="text-xs mr-1">Delete this message?</span>
                <button
                  onClick={onCancelDelete}
                  className="flex items-center gap-1 rounded px-2 py-1 min-h-[44px] text-xs text-muted-foreground hover:bg-muted transition-colors sm:min-h-0 sm:py-0.5"
                  disabled={isDeletePending}
                >
                  No
                </button>
                <button
                  onClick={onConfirmDelete}
                  className="flex items-center gap-1 rounded px-2 py-1 min-h-[44px] text-xs bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors sm:min-h-0 sm:py-0.5"
                  disabled={isDeletePending}
                >
                  Yes
                </button>
              </div>
            </div>
          ) : (
            /* Normal message content */
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}

          {/* Edited indicator */}
          {isEdited && !isEditing && (
            <span
              className={`text-xs ${
                isOwn
                  ? "text-primary-foreground/60"
                  : "text-muted-foreground"
              }`}
            >
              (edited)
            </span>
          )}
        </div>
      </div>

      {/* Timestamp and action row */}
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/70">
          {timeAgo(msg.created_at)}
        </span>

        {isTopLevel && !isEditing && !isDeleting && (
          <>
            {/* Reply button */}
            <button
              onClick={() => onReply(msg.id)}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1 sm:min-h-0"
              aria-label="Reply to message"
            >
              <Reply className="size-3.5" />
              Reply
            </button>

            {/* Thread toggle */}
            {replyCount > 0 && (
              <button
                onClick={() => onToggleThread(msg.id)}
                className="flex items-center gap-0.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors min-h-[44px] px-1 sm:min-h-0"
                aria-label={
                  expandedThreadId === msg.id
                    ? "Hide replies"
                    : `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                }
              >
                <ChevronDown
                  className={`size-3.5 transition-transform ${
                    expandedThreadId === msg.id ? "rotate-180" : ""
                  }`}
                />
                {expandedThreadId === msg.id
                  ? "Hide replies"
                  : `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Inline reply input
// ============================================================

interface ReplyInputProps {
  onSend: (content: string) => void;
  onCancel: () => void;
  isPending: boolean;
}

function ReplyInput({ onSend, onCancel, isPending }: ReplyInputProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend(value.trim());
        setValue("");
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="flex items-end gap-1.5 mt-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write a reply..."
        rows={1}
        autoFocus
        className="flex-1 resize-none rounded border bg-card px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary"
      />
      <button
        onClick={() => {
          if (value.trim()) {
            onSend(value.trim());
            setValue("");
          }
        }}
        disabled={!value.trim() || isPending}
        className="shrink-0 rounded bg-primary p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors sm:p-1.5 sm:min-h-0 sm:min-w-0"
        aria-label="Send reply"
      >
        <Send className="size-3.5 sm:size-3" />
      </button>
      <button
        onClick={onCancel}
        className="shrink-0 rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors sm:p-1.5 sm:min-h-0 sm:min-w-0"
        aria-label="Cancel reply"
      >
        <X className="size-3.5 sm:size-3" />
      </button>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function ShiftThread({
  sessionId,
  messages: initialMessages,
  currentUserId,
}: ShiftThreadProps) {
  const router = useRouter();
  const [messages, setMessages] =
    useState<ShiftThreadMessage[]>(initialMessages);
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isEditPending, startEditTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Thread UI state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync with parent prop changes
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Auto-scroll to bottom when top-level messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // ---- Realtime subscription ----
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`shift-thread-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shift_threads",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            content: string | null;
            user_id: string;
            created_at: string;
            updated_at: string | null;
            deleted_at: string | null;
            parent_message_id: string | null;
            session_id: string;
          };

          // Skip if we already have this message (optimistic or from our own insert)
          const alreadyExists = messages.some((m) => m.id === newRow.id);
          if (alreadyExists) return;

          // Fetch author name from profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", newRow.user_id)
            .single();

          const newMessage: ShiftThreadMessage = {
            id: newRow.id,
            content: newRow.content,
            user_id: newRow.user_id,
            created_at: newRow.created_at,
            updated_at: newRow.updated_at,
            deleted_at: newRow.deleted_at,
            parent_message_id: newRow.parent_message_id,
            author_name: profile?.name ?? "Unknown",
            reply_count: 0,
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newRow.id)) return prev;

            // If it's a reply, increment the parent's reply_count
            if (newRow.parent_message_id) {
              const updated = prev.map((m) =>
                m.id === newRow.parent_message_id
                  ? { ...m, reply_count: m.reply_count + 1 }
                  : m
              );
              return [...updated, newMessage];
            }

            return [...prev, newMessage];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shift_threads",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            content: string | null;
            updated_at: string | null;
            deleted_at: string | null;
          };

          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    content: updated.content,
                    updated_at: updated.updated_at,
                    deleted_at: updated.deleted_at,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, messages]);

  // ---- Derived data ----
  const topLevelMessages = messages.filter(
    (m) => m.parent_message_id === null
  );
  const getReplies = useCallback(
    (parentId: string) =>
      messages
        .filter((m) => m.parent_message_id === parentId)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [messages]
  );

  // ---- Handlers ----

  /** Send a new top-level message. */
  async function handleSend() {
    const text = content.trim();
    if (!text) return;

    setContent("");

    startTransition(async () => {
      const result = await addShiftThreadMessage(sessionId, text);
      if (result.error) {
        setContent(text);
        toast.error("Failed to send message. Please try again.");
      }
      router.refresh();
    });
  }

  /** Send a reply to a parent message. */
  async function handleSendReply(parentId: string, replyContent: string) {
    setReplyingTo(null);
    // Auto-expand the thread when replying
    setExpandedThreadId(parentId);

    startTransition(async () => {
      const result = await addShiftThreadMessage(
        sessionId,
        replyContent,
        parentId
      );
      if (result.error) {
        toast.error("Failed to send reply. Please try again.");
      }
      router.refresh();
    });
  }

  /** Enter edit mode for a message. */
  function handleStartEdit(messageId: string) {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.content) return;
    setEditingId(messageId);
    setEditContent(msg.content);
    setDeletingId(null);
  }

  /** Save the edited message content. */
  function handleSaveEdit() {
    if (!editingId || !editContent.trim()) return;

    const savedId = editingId;
    const savedContent = editContent.trim();

    startEditTransition(async () => {
      const result = await editShiftThreadMessage(savedId, savedContent);
      if (result.error) {
        toast.error("Failed to edit message. Please try again.");
      } else {
        setEditingId(null);
        setEditContent("");
      }
      router.refresh();
    });
  }

  /** Cancel editing and restore original state. */
  function handleCancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  /** Show delete confirmation for a message. */
  function handleStartDelete(messageId: string) {
    setDeletingId(messageId);
    setEditingId(null);
  }

  /** Confirm and execute message deletion. */
  function handleConfirmDelete() {
    if (!deletingId) return;

    const savedId = deletingId;

    startDeleteTransition(async () => {
      const result = await deleteShiftThreadMessage(savedId);
      if (result.error) {
        toast.error("Failed to delete message. Please try again.");
      } else {
        setDeletingId(null);
      }
      router.refresh();
    });
  }

  /** Cancel delete confirmation. */
  function handleCancelDelete() {
    setDeletingId(null);
  }

  /** Toggle the expanded reply thread for a message. */
  function handleToggleThread(messageId: string) {
    setExpandedThreadId((prev) => (prev === messageId ? null : messageId));
  }

  /** Handle keyboard shortcuts on the main input. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ---- Render ----
  const totalCount = messages.filter((m) => m.deleted_at === null).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">
          Shift Discussion
        </h3>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ({totalCount})
          </span>
        )}
      </div>

      {/* Messages list */}
      {topLevelMessages.length > 0 ? (
        <div
          ref={scrollRef}
          className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3"
        >
          {topLevelMessages.map((msg) => {
            const isOwn = msg.user_id === currentUserId;
            const replyCount = messages.filter(
              (m) => m.parent_message_id === msg.id
            ).length;
            const replies = getReplies(msg.id);
            const isExpanded = expandedThreadId === msg.id;

            return (
              <div key={msg.id} className="space-y-1">
                {/* Top-level message bubble */}
                <MessageBubble
                  msg={msg}
                  isOwn={isOwn}
                  currentUserId={currentUserId}
                  onReply={setReplyingTo}
                  onStartEdit={handleStartEdit}
                  onDelete={handleStartDelete}
                  editingId={editingId}
                  editContent={editContent}
                  setEditContent={setEditContent}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  deletingId={deletingId}
                  onConfirmDelete={handleConfirmDelete}
                  onCancelDelete={handleCancelDelete}
                  isEditPending={isEditPending}
                  isDeletePending={isDeletePending}
                  replyCount={replyCount}
                  expandedThreadId={expandedThreadId}
                  onToggleThread={handleToggleThread}
                  isTopLevel={true}
                />

                {/* Expanded reply thread */}
                {isExpanded && replies.length > 0 && (
                  <div className="border-l-2 border-border pl-4 ml-6 space-y-2">
                    {replies.map((reply) => {
                      const isReplyOwn = reply.user_id === currentUserId;
                      return (
                        <MessageBubble
                          key={reply.id}
                          msg={reply}
                          isOwn={isReplyOwn}
                          currentUserId={currentUserId}
                          onReply={() => setReplyingTo(msg.id)}
                          onStartEdit={handleStartEdit}
                          onDelete={handleStartDelete}
                          editingId={editingId}
                          editContent={editContent}
                          setEditContent={setEditContent}
                          onSaveEdit={handleSaveEdit}
                          onCancelEdit={handleCancelEdit}
                          deletingId={deletingId}
                          onConfirmDelete={handleConfirmDelete}
                          onCancelDelete={handleCancelDelete}
                          isEditPending={isEditPending}
                          isDeletePending={isDeletePending}
                          replyCount={0}
                          expandedThreadId={null}
                          onToggleThread={() => {}}
                          isTopLevel={false}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Inline reply input (shown when replying or when thread is expanded) */}
                {(replyingTo === msg.id ||
                  (isExpanded && replyingTo !== msg.id)) && (
                  <div className="ml-6 pl-4 border-l-2 border-border">
                    <ReplyInput
                      onSend={(text) => handleSendReply(msg.id, text)}
                      onCancel={() => {
                        setReplyingTo(null);
                        // If opened via expand, collapse the thread too
                        if (replyingTo !== msg.id) {
                          setExpandedThreadId(null);
                        }
                      }}
                      isPending={isPending}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No messages yet. Start a discussion about this shift.
        </p>
      )}

      {/* Main message input */}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!content.trim() || isPending}
          className="shrink-0 bg-primary hover:bg-primary/90 min-h-[44px] min-w-[44px]"
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
