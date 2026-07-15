"use client";

import { useState, useEffect } from "react";
import { MoreVertical, Copy, ArrowLeftRight, FileText, Loader2, UserPlus, Repeat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { duplicateSession, repeatSessionForward } from "@/lib/sessions/actions";
import type { RecurrenceFrequency } from "@/lib/utils/roster";
import { SwapCoachPopover } from "./swap-coach-popover";
import { SessionNotesPopover } from "./session-notes-popover";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";

interface SessionCardMenuProps {
  session: SessionWithRelations;
  coaches: Pick<Profile, "id" | "name">[];
  onChange: () => void;
}

export function SessionCardMenu({
  session,
  coaches,
  onChange,
}: SessionCardMenuProps) {
  const [openMenu, setOpenMenu] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [noting, setNoting] = useState(false);
  const [localNotes, setLocalNotes] = useState(session.notes);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<RecurrenceFrequency>("weekly");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [repeating, setRepeating] = useState(false);

  async function handleRepeat() {
    if (!repeatUntil) {
      toast.error("Choose an end date.");
      return;
    }
    setRepeating(true);
    const { data, error } = await repeatSessionForward(session.id, {
      frequency: repeatFreq,
      until: repeatUntil,
    });
    setRepeating(false);
    if (error || !data) {
      toast.error(error ?? "Failed to repeat the shift.");
      return;
    }
    toast.success(
      `${data.created} shift${data.created === 1 ? "" : "s"} created` +
        (data.skipped.length > 0
          ? ` — ${data.skipped.length} skipped (already booked)`
          : "") +
        "."
    );
    setRepeatOpen(false);
    setRepeatUntil("");
    onChange();
  }

  // Resync localNotes when session.notes changes (e.g. after router.refresh)
  useEffect(() => {
    setLocalNotes(session.notes);
  }, [session.notes]);

  async function handleDuplicate() {
    setDuplicating(true);
    const result = await duplicateSession(session.id);
    setDuplicating(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (!result.data) return;
    toast.success("Shift duplicated.");
    // onChange() in roster contexts is RosterPage.handleRefresh, which
    // already calls router.refresh() — no need to refresh twice.
    //
    // v1 deviation from spec §5 P3 (which says "opens the new card in
    // edit mode"): we refresh the grid and let the admin click the new
    // draft card to edit it. Auto-open requires lifting the new id up
    // to RosterPage and threading it into SessionDetailSheet state —
    // worth a follow-up but the toast + grid update give enough
    // signal for v1.
    onChange();
  }

  return (
    <div className="absolute right-1 top-1 z-10">
      <DropdownMenu open={openMenu} onOpenChange={setOpenMenu}>
        {/* base-ui pattern: DropdownMenuTrigger takes a render prop, not asChild */}
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="Session actions"
            >
              <MoreVertical className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          className="w-44"
        >
          <DropdownMenuItem onSelect={() => setSwapping(true)}>
            {session.coach_id ? (
              <ArrowLeftRight className="mr-2 h-3.5 w-3.5" />
            ) : (
              <UserPlus className="mr-2 h-3.5 w-3.5" />
            )}
            {session.coach_id ? "Swap coach" : "Assign coach"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNoting(true)}>
            <FileText className="mr-2 h-3.5 w-3.5" />
            {localNotes ? "Edit note" : "Add note"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleDuplicate} disabled={duplicating}>
            {duplicating ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-2 h-3.5 w-3.5" />
            )}
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRepeatOpen(true)}>
            <Repeat className="mr-2 h-3.5 w-3.5" />
            Repeat into future weeks…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Repeat-forward dialog */}
      <Dialog open={repeatOpen} onOpenChange={setRepeatOpen}>
        <DialogContent
          className="sm:max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Repeat this shift</DialogTitle>
            <DialogDescription>
              Copies this shift (same time, coach and centre) into future
              weeks, starting one step after {session.date}. Dates already
              booked are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select
                value={repeatFreq}
                onValueChange={(v) =>
                  setRepeatFreq((v as RecurrenceFrequency) ?? "weekly")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Weekly" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="four_weekly">
                    Monthly (every 4 weeks)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`repeat-until-${session.id}`}>Until</Label>
              <Input
                id={`repeat-until-${session.id}`}
                type="date"
                value={repeatUntil}
                min={session.date}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepeatOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRepeat}
              disabled={repeating}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {repeating ? <Loader2 className="size-4 animate-spin" /> : null}
              Create shifts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Headless popovers — controlled by menu items. Render a hidden
          trigger so the Popover anchors to this menu's container. */}
      <SwapCoachPopover
        open={swapping}
        onOpenChange={setSwapping}
        sessionId={session.id}
        currentCoachId={session.coach_id}
        coaches={coaches}
        onSwapped={() => {
          setSwapping(false);
          onChange();
        }}
      >
        <span className="sr-only" aria-hidden="true" />
      </SwapCoachPopover>

      <SessionNotesPopover
        open={noting}
        onOpenChange={setNoting}
        sessionId={session.id}
        initialNotes={localNotes}
        onSaved={(next) => {
          setLocalNotes(next);
          setNoting(false);
          onChange();
        }}
      >
        <span className="sr-only" aria-hidden="true" />
      </SessionNotesPopover>
    </div>
  );
}
