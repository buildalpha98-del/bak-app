"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateSession } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";

interface SwapCoachPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  currentCoachId: string | null;
  coaches: Pick<Profile, "id" | "name">[];
  onSwapped: () => void;
  children: React.ReactNode; // trigger
}

export function SwapCoachPopover({
  open,
  onOpenChange,
  sessionId,
  currentCoachId,
  coaches,
  onSwapped,
  children,
}: SwapCoachPopoverProps) {
  const [coachId, setCoachId] = useState<string | null>(currentCoachId);
  const [saving, setSaving] = useState(false);

  // Resync coachId when currentCoachId prop changes
  useEffect(() => {
    setCoachId(currentCoachId);
  }, [currentCoachId]);

  async function handleSave() {
    if (coachId === currentCoachId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const result = await updateSession(sessionId, { coach_id: coachId });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Coach updated.");
    onSwapped();
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* base-ui pattern: PopoverTrigger takes a render prop, not asChild */}
      <PopoverTrigger render={<span>{children}</span>} />
      <PopoverContent className="w-72 p-3 space-y-2" side="right" align="start">
        <div>
          <Label className="text-xs">Swap coach</Label>
          <Select
            value={coachId ?? "__unassigned__"}
            onValueChange={(v) => setCoachId(v === "__unassigned__" ? null : v)}
          >
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="Select coach" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">— Unassigned —</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
