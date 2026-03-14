"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// Types
// ============================================================

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

// ============================================================
// Component
// ============================================================

export function InlineEdit({
  value,
  onSave,
  className = "",
  inputClassName = "",
  placeholder = "",
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when value prop changes
  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  // Auto-focus on edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSave = useCallback(async () => {
    // If unchanged, just exit edit mode
    if (draft === value) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Revert on error
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  // ── Edit mode ──
  if (editing) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={saving}
          className={`rounded-lg border border-primary/30 bg-background px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${inputClassName}`}
        />
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 text-primary hover:text-primary/80"
          onClick={handleSave}
          disabled={saving}
          aria-label="Save"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleCancel}
          disabled={saving}
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </Button>
      </span>
    );
  }

  // ── Display mode ──
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 -mx-1.5 hover:bg-secondary/60 transition-colors ${className}`}
    >
      <span className="text-sm">
        {value || (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </span>
      <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
