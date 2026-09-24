"use client";

// The coach's week: a switch and a start/finish per day. Saved as one
// availability_slots row per available day — what the AI solver reads.

import { useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveMyAvailability, type DayWindow } from "@/lib/coach/availability-actions";

const DAYS: Array<{ n: number; label: string }> = [
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
  { n: 6, label: "Saturday" },
  { n: 0, label: "Sunday" },
];
const DEFAULT = { start_time: "08:00", end_time: "16:30" };

export function AvailabilityEditor({ initial }: { initial: DayWindow[] }) {
  const [days, setDays] = useState<Record<number, { on: boolean; start_time: string; end_time: string }>>(() =>
    Object.fromEntries(
      DAYS.map((d) => {
        const w = initial.find((x) => x.day_of_week === d.n);
        return [d.n, w ? { on: true, start_time: w.start_time, end_time: w.end_time } : { on: false, ...DEFAULT }];
      })
    )
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = (n: number, patch: Partial<{ on: boolean; start_time: string; end_time: string }>) => {
    setDays((d) => ({ ...d, [n]: { ...d[n], ...patch } }));
    setDirty(true);
  };
  const onCount = Object.values(days).filter((d) => d.on).length;

  async function save() {
    setSaving(true);
    const { error } = await saveMyAvailability(
      DAYS.filter((d) => days[d.n].on).map((d) => ({ day_of_week: d.n, start_time: days[d.n].start_time, end_time: days[d.n].end_time }))
    );
    setSaving(false);
    if (error) toast.error(error);
    else {
      toast.success(onCount === 0 ? "Saved — you're marked unavailable every day." : `Saved — available ${onCount} day${onCount === 1 ? "" : "s"} a week.`);
      setDirty(false);
    }
  }

  return (
    <div id="availability" className="rounded-2xl border border-border bg-card p-4 space-y-3 transition-shadow hover:shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <CalendarCheck className="size-4" /> My Availability
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The days and hours you can coach. Ops and the AI roster only offer you shifts inside these windows — leave a day off and you won&apos;t be rostered on it.
        </p>
      </div>
      {initial.length === 0 && !dirty && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">You haven&apos;t set any availability yet, so the roster can&apos;t place you. Tick the days you can work.</p>
      )}
      <ul className="divide-y">
        {DAYS.map((d) => {
          const v = days[d.n];
          return (
            <li key={d.n} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <label className="flex min-h-11 w-32 items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox checked={v.on} onCheckedChange={(c) => set(d.n, { on: c === true })} aria-label={`Available ${d.label}`} />
                {d.label}
              </label>
              <input type="time" value={v.start_time} disabled={!v.on} onChange={(e) => set(d.n, { start_time: e.target.value })} aria-label={`${d.label} start`} className="h-11 rounded-md border bg-background px-2 text-sm disabled:opacity-40" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="time" value={v.end_time} disabled={!v.on} onChange={(e) => set(d.n, { end_time: e.target.value })} aria-label={`${d.label} finish`} className="h-11 rounded-md border bg-background px-2 text-sm disabled:opacity-40" />
            </li>
          );
        })}
      </ul>
      <Button onClick={save} disabled={saving || !dirty} className="min-h-11 w-full sm:w-auto">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save availability
      </Button>
    </div>
  );
}
