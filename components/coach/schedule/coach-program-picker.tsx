"use client";

// ============================================================
// Coach programme picker
// ============================================================
//
// Lets the assigned coach choose (or change) the programme they'll
// run for their own session — the detail page used to be read-only
// with "No programme assigned" as a dead end. Server-side
// authorization lives in assignProgramToSession (assigned coaches
// and staff only).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignProgramToSession,
  getProgramsForSport,
} from "@/lib/programs/actions";
import type { ProgramListItem } from "@/lib/programs/actions";

interface Props {
  sessionId: string;
  sport: string;
  currentProgramId: string | null;
}

export function CoachProgramPicker({
  sessionId,
  sport,
  currentProgramId,
}: Props) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<ProgramListItem[]>([]);

  async function openPicker() {
    setPicking(true);
    setLoading(true);
    const { data } = await getProgramsForSport(sport);
    setPrograms(data ?? []);
    setLoading(false);
  }

  async function handlePick(programId: string) {
    setSaving(true);
    const { error } = await assignProgramToSession(
      sessionId,
      programId === "none" ? null : programId
    );
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      programId === "none" ? "Programme removed." : "Programme set."
    );
    setPicking(false);
    router.refresh();
  }

  if (!picking) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={openPicker}
        className="min-h-[40px]"
      >
        {currentProgramId ? "Change programme" : "Choose a programme"}
      </Button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading programmes…
      </div>
    );
  }

  if (programs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No {sport} programmes in the library yet — ask the office to
        generate one.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={currentProgramId ?? "none"}
        onValueChange={(v) => v && handlePick(v)}
        disabled={saving}
      >
        <SelectTrigger className="min-h-[40px] w-full sm:w-auto sm:min-w-[240px]">
          <SelectValue placeholder="Select a programme…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No programme</SelectItem>
          {programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPicking(false)}
        disabled={saving}
      >
        Cancel
      </Button>
    </div>
  );
}
