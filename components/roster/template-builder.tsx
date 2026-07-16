"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import { ArrowLeft, Plus, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemplateEntryCard } from "./template-entry-card";
import { TemplateEntryDialog } from "./template-entry-dialog";
import { GenerateSessionsDialog } from "./generate-sessions-dialog";
import type { TermTemplateWithRelations } from "@/lib/terms/actions";
import type { Term, Centre, Profile } from "@/lib/types/database";

// ============================================================
// Constants
// ============================================================

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// 7:00 to 17:30 in 30-min slots = 22 time slots
const TIME_SLOTS: string[] = [];
for (let h = 7; h < 18; h++) {
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);
  if (h < 17 || (h === 17 && false)) {
    TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:30`);
  }
}
// Remove the last 17:30 since we end at 17:30 display but sessions don't start then
// Actually let's keep slots from 07:00 to 17:30 inclusive for display
// Rebuild cleanly:
const SLOT_TIMES: string[] = [];
for (let h = 7; h <= 17; h++) {
  SLOT_TIMES.push(`${h.toString().padStart(2, "0")}:00`);
  if (h < 18) {
    SLOT_TIMES.push(`${h.toString().padStart(2, "0")}:30`);
  }
}

function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

/** Convert "HH:mm" time to a grid row index (1-based, row 1 = header) */
function timeToRow(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  // 07:00 → row 2 (row 1 is header)
  const slotIndex = (h - 7) * 2 + (m >= 30 ? 1 : 0);
  return slotIndex + 2; // +2 because row 1 is header
}

/** Duration in minutes → number of 30-min rows */
function durationToSpan(duration: number): number {
  return Math.max(1, Math.round(duration / 30));
}

function termStatusVariant(
  status: string
): "default" | "secondary" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "completed":
      return "secondary";
    default:
      return "outline";
  }
}

// ============================================================
// Component
// ============================================================

interface TemplateBuilderProps {
  term: Term;
  templates: TermTemplateWithRelations[];
  centres: Pick<Centre, "id" | "name">[];
  coaches: Pick<Profile, "id" | "name">[];
  basePath: string;
}

export function TemplateBuilder({
  term,
  templates,
  centres,
  coaches,
  basePath,
}: TemplateBuilderProps) {
  const router = useRouter();

  // Entry dialog state
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<
    TermTemplateWithRelations | undefined
  >();
  const [defaultDay, setDefaultDay] = useState<number | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();

  // Generate sessions dialog state
  const [genDialogOpen, setGenDialogOpen] = useState(false);

  function openAdd(day?: number, time?: string) {
    setEditEntry(undefined);
    setDefaultDay(day);
    setDefaultTime(time);
    setEntryDialogOpen(true);
  }

  function openEdit(entry: TermTemplateWithRelations) {
    setEditEntry(entry);
    setDefaultDay(undefined);
    setDefaultTime(undefined);
    setEntryDialogOpen(true);
  }

  // Group templates by day+time for grid placement
  const templatesByDayAndSlot = new Map<string, TermTemplateWithRelations[]>();
  for (const tpl of templates) {
    const key = `${tpl.day_of_week}_${tpl.time.slice(0, 5)}`;
    const arr = templatesByDayAndSlot.get(key) ?? [];
    arr.push(tpl);
    templatesByDayAndSlot.set(key, arr);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link href={basePath} />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">
                {term.name}
              </h1>
              <Badge variant={termStatusVariant(term.status)}>
                {term.status.charAt(0).toUpperCase() + term.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Weekly session template
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openAdd()}>
            <Plus className="size-4" />
            Add Session
          </Button>
          <Button onClick={() => setGenDialogOpen(true)}>
            <Zap className="size-4" />
            Generate Sessions
          </Button>
        </div>
      </div>

      {/* Weekly Timetable Grid */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div
          className="grid min-w-[700px]"
          style={{
            gridTemplateColumns: "80px repeat(5, 1fr)",
            gridTemplateRows: `auto repeat(${SLOT_TIMES.length}, 40px)`,
          }}
        >
          {/* Header row */}
          <div className="sticky top-0 z-10 border-b bg-muted/50 p-2" />
          {DAY_LABELS.map((day, i) => (
            <div
              key={day}
              className="sticky top-0 z-10 border-b border-l bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}

          {/* Time rows */}
          {SLOT_TIMES.map((slot, rowIdx) => {
            const isHour = slot.endsWith(":00");
            return (
              <Fragment key={slot}>
                {/* Time label cell */}
                <div
                  className={`flex items-start justify-end border-b px-2 pt-0.5 text-[11px] text-muted-foreground ${
                    isHour ? "font-medium" : ""
                  }`}
                  style={{ gridRow: rowIdx + 2 }}
                >
                  {isHour ? formatTime12(slot) : ""}
                </div>

                {/* Day columns */}
                {DAY_LABELS.map((_, dayIdx) => {
                  const dayNum = dayIdx + 1;
                  const key = `${dayNum}_${slot}`;
                  const entries = templatesByDayAndSlot.get(key);

                  return (
                    <div
                      key={`cell-${dayNum}-${slot}`}
                      className={`relative border-b border-l ${
                        isHour ? "border-b-border" : "border-b-border/40"
                      }`}
                      style={{ gridRow: rowIdx + 2, gridColumn: dayIdx + 2 }}
                    >
                      {/* Clickable empty area */}
                      {!entries && (
                        <button
                          type="button"
                          className="absolute inset-0 cursor-pointer hover:bg-muted/30"
                          onClick={() => openAdd(dayNum, slot)}
                          title={`Add session – ${DAY_LABELS[dayIdx]} ${formatTime12(slot)}`}
                        />
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}

          {/* Positioned template entry cards (absolute within the grid) */}
          {templates.map((tpl) => {
            const timeKey = tpl.time.slice(0, 5);
            const row = timeToRow(timeKey);
            const span = durationToSpan(tpl.duration_minutes);
            const col = tpl.day_of_week + 1; // +1 for time column offset

            return (
              <div
                key={tpl.id}
                className="z-[5] p-0.5"
                style={{
                  gridRow: `${row} / span ${span}`,
                  gridColumn: col,
                }}
              >
                <TemplateEntryCard
                  entry={tpl}
                  onClick={() => openEdit(tpl)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Template summary */}
      <p className="text-center text-xs text-muted-foreground">
        {templates.length} session{templates.length !== 1 ? "s" : ""} per week
        · Click an empty slot to add a session
      </p>

      {/* Dialogs */}
      <TemplateEntryDialog
        open={entryDialogOpen}
        onOpenChange={setEntryDialogOpen}
        termId={term.id}
        entry={editEntry}
        centres={centres}
        coaches={coaches}
        defaultDay={defaultDay}
        defaultTime={defaultTime}
        onSuccess={() => router.refresh()}
      />

      <GenerateSessionsDialog
        open={genDialogOpen}
        onOpenChange={setGenDialogOpen}
        term={term}
        templateCount={templates.length}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
