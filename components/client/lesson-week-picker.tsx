"use client";

// Put a saved lesson on the Scope & Sequence (migration 093): pick the
// term week it will be taught in, or take it off.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setLessonWeek } from "@/lib/client/lesson-actions";
import type { TermWeek } from "@/lib/schools/term-weeks";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

function fmt(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: SYDNEY_TZ });
}

export function LessonWeekPicker({
  centreId,
  programId,
  termName,
  weeks,
  plannedFor,
}: {
  centreId: string;
  programId: string;
  termName: string;
  weeks: TermWeek[];
  plannedFor: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(plannedFor ?? "");
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    setValue(next);
    startTransition(async () => {
      const { error } = await setLessonWeek(centreId, programId, next || null);
      if (error) {
        toast.error(error);
        setValue(plannedFor ?? "");
        return;
      }
      const wk = weeks.find((w) => w.weekStart === next);
      toast.success(wk ? `On the Scope & Sequence for Week ${wk.weekNumber}.` : "Taken off the Scope & Sequence.");
      router.refresh();
    });
  }

  return (
    <label className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-portal-200 bg-portal-50 px-3 text-sm text-portal-800">
      <CalendarDays className="h-4 w-4" />
      <span className="hidden sm:inline">Scope &amp; Sequence:</span>
      <select
        aria-label="Scope & Sequence week"
        className="bg-transparent text-sm font-medium outline-none"
        value={value}
        disabled={isPending}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Not scheduled</option>
        {weeks.map((w) => (
          <option key={w.weekStart} value={w.weekStart}>
            {termName} · Week {w.weekNumber} ({fmt(w.weekStart)})
          </option>
        ))}
      </select>
      {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
    </label>
  );
}
