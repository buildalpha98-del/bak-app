"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateSessionNotes } from "@/lib/sessions/actions";

interface SessionNotesPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  initialNotes: string | null;
  onSaved: (notes: string | null) => void;
  children: React.ReactNode;
}

const MAX = 2000;

export function SessionNotesPopover({
  open,
  onOpenChange,
  sessionId,
  initialNotes,
  onSaved,
  children,
}: SessionNotesPopoverProps) {
  const [text, setText] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);

  // Re-sync if the parent passes a different session
  useEffect(() => {
    if (open) setText(initialNotes ?? "");
  }, [open, initialNotes]);

  async function handleSave() {
    setSaving(true);
    const result = await updateSessionNotes(sessionId, text);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const next = text.trim() === "" ? null : text.trim();
    onSaved(next);
    onOpenChange(false);
  }

  const over = text.length > MAX;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* base-ui pattern: PopoverTrigger takes a render prop, not asChild */}
      <PopoverTrigger render={<span>{children}</span>} />
      <PopoverContent className="w-80 p-3 space-y-2" side="right" align="start">
        <div>
          <Label className="text-xs" htmlFor="session-note">
            Note
          </Label>
          <Textarea
            id="session-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. parent collecting at 3:45 — check ID before release"
            rows={4}
            maxLength={MAX}
            className="mt-1 text-xs"
          />
          <p className={`mt-1 text-[10px] ${over ? "text-red-500" : "text-muted-foreground/60"}`}>
            {text.length} / {MAX}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || over}>
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
