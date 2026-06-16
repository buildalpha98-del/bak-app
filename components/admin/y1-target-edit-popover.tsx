"use client";

// ============================================================
// Y1 target inline-edit popover
// ============================================================
//
// Wraps a small pencil icon in a base-ui Popover. Click → number input
// + Save/Cancel. On Save, optimistically updates the displayed target
// via the supplied `onSaved(newValue)` and calls `updateY1Targets`.
// Toasts on success/failure via sonner.
//
// Visible only when `enabled` is true (admin viewer with edit rights).

import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { updateY1Targets } from "@/lib/launch/y1-targets-actions";
import type { Y1TargetField } from "@/lib/launch/y1-targets-types";

interface Y1TargetEditPopoverProps {
  field: Y1TargetField;
  label: string;
  /** Current value shown next to the input. */
  current: number;
  /** Called with the new value once the save succeeds. */
  onSaved: (newValue: number) => void;
  /** Hide the trigger entirely when the viewer can't edit. */
  enabled: boolean;
  /** Display prefix (e.g. "$") rendered next to the number input. */
  prefix?: string;
}

export function Y1TargetEditPopover({
  field,
  label,
  current,
  onSaved,
  enabled,
  prefix,
}: Y1TargetEditPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(current));
  const [saving, setSaving] = useState(false);

  if (!enabled) return null;

  function reset() {
    setDraft(String(current));
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSave() {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric) || numeric < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await updateY1Targets({ [field]: numeric });
      if (error) {
        toast.error(error);
        return;
      }
      onSaved(Math.round(numeric));
      toast.success(`Updated ${label.toLowerCase()} target.`);
      setOpen(false);
    } catch (err) {
      console.error("[Y1TargetEditPopover] save failed:", err);
      toast.error((err as Error).message || "Could not save target.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${label} target`}
            className="opacity-0 transition group-hover/card:opacity-100 hover:text-[#E8712A] focus-visible:opacity-100"
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-60 gap-3 p-3"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {label} target
          </p>
          <p className="text-xs text-muted-foreground">Year-1 goal</p>
        </div>

        <label className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[#E8712A]/30">
          {prefix && (
            <span className="text-sm text-muted-foreground">{prefix}</span>
          )}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
            autoFocus
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving || draft === String(current)}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
