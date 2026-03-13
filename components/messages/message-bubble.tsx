"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, CheckCircle2, X } from "lucide-react";
import type { DirectMessage } from "@/lib/types/database";

interface MessageBubbleProps {
  message: DirectMessage;
  isOwn: boolean;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function MessageBubble({
  message,
  isOwn,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content ?? "");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Deleted message
  if (message.deleted_at) {
    return (
      <div
        className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}
      >
        <div
          className={`max-w-[75%] px-4 py-2 ${
            isOwn
              ? "ml-auto rounded-2xl rounded-br-md"
              : "mr-auto rounded-2xl rounded-bl-md"
          } opacity-60`}
        >
          <p className="text-sm italic text-muted-foreground">
            This message was deleted
          </p>
        </div>
      </div>
    );
  }

  const isEdited =
    message.updated_at &&
    message.updated_at !== message.created_at &&
    !message.deleted_at;

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      setEditContent(message.content ?? "");
      return;
    }
    setIsSaving(true);
    try {
      await onEdit(message.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await onDelete(message.id);
      setIsConfirmingDelete(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditContent(message.content ?? "");
    }
  };

  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1 group`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!isEditing && !isConfirmingDelete) {
          setIsConfirmingDelete(false);
        }
      }}
    >
      <div className="relative max-w-[75%]">
        {/* Action buttons for own messages */}
        {isOwn && isHovered && !isEditing && !isConfirmingDelete && (
          <div className="absolute -top-3 right-0 flex items-center gap-1 z-10">
            <button
              onClick={() => {
                setEditContent(message.content ?? "");
                setIsEditing(true);
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-card border border-border text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Edit message"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => setIsConfirmingDelete(true)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-card border border-border text-muted-foreground hover:text-destructive transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Delete message"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`px-4 py-2 ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
              : "bg-card border border-border text-foreground rounded-2xl rounded-bl-md"
          }`}
        >
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                maxLength={2000}
                rows={2}
                className="w-full min-w-[200px] resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(message.content ?? "");
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
              <div
                className={`flex items-center gap-1.5 mt-1 ${
                  isOwn ? "justify-end" : "justify-start"
                }`}
              >
                <span
                  className={`text-xs ${
                    isOwn
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatRelativeTime(message.created_at)}
                </span>
                {isEdited && (
                  <span
                    className={`text-xs ${
                      isOwn
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    (edited)
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Delete confirmation */}
        {isConfirmingDelete && (
          <div
            className={`mt-1 flex items-center gap-2 text-xs ${
              isOwn ? "justify-end" : "justify-start"
            }`}
          >
            <span className="text-muted-foreground">Delete this message?</span>
            <button
              onClick={handleDelete}
              disabled={isSaving}
              className="font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              onClick={() => setIsConfirmingDelete(false)}
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
