"use client";

import { useState, useEffect } from "react";
import { MoreVertical, Copy, ArrowLeftRight, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { duplicateSession } from "@/lib/sessions/actions";
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
            <ArrowLeftRight className="mr-2 h-3.5 w-3.5" />
            Swap coach
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
        </DropdownMenuContent>
      </DropdownMenu>

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
