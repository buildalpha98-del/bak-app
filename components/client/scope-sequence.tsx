"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, User, CalendarDays, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WeeklyProgramEntry } from "@/lib/client/curriculum-actions";
import { OutcomeBadges } from "@/components/client/outcome-badges";
import { SessionReflection } from "@/components/client/session-reflection";

interface ScopeSequenceViewProps {
  weeks: WeeklyProgramEntry[];
  centreType: "childcare_centre" | "school";
}

const SPORT_COLOURS: Record<string, string> = {
  Soccer: "bg-green-100 text-green-700",
  Basketball: "bg-orange-100 text-orange-700",
  Athletics: "bg-yellow-100 text-yellow-700",
  Yoga: "bg-purple-100 text-purple-700",
  Pilates: "bg-pink-100 text-pink-700",
  "Boot Camp": "bg-red-100 text-red-700",
  Swimming: "bg-cyan-100 text-cyan-700",
  Pickleball: "bg-lime-100 text-lime-700",
  Golf: "bg-emerald-100 text-emerald-700",
  Hockey: "bg-blue-100 text-blue-700",
  Lacrosse: "bg-violet-100 text-violet-700",
  "Motor Skills": "bg-sky-100 text-sky-700",
  "Multi-Sport": "bg-teal-100 text-teal-700",
  Cricket: "bg-amber-100 text-amber-700",
  Netball: "bg-fuchsia-100 text-fuchsia-700",
  Tennis: "bg-yellow-100 text-yellow-800",
  Volleyball: "bg-orange-100 text-orange-800",
  Dance: "bg-rose-100 text-rose-700",
  Gymnastics: "bg-purple-100 text-purple-800",
};

function sportColour(sport: string): string {
  return SPORT_COLOURS[sport] ?? "bg-gray-100 text-gray-700";
}

function statusColour(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "confirmed":
    case "published":
      return "bg-portal-100 text-portal-700";
    case "pending_confirmation":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "confirmed":
      return "Confirmed";
    case "published":
      return "Scheduled";
    case "pending_confirmation":
      return "Pending";
    default:
      return status;
  }
}

function formatDateNice(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatWeekRange(weekStartDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startStr = start.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${startStr} – ${endStr}`;
}

function isCurrentWeek(weekStartDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return today >= start && today <= end;
}

interface ProgramContentData {
  title?: string;
  objectives?: string[];
  warmUp?: { name?: string };
  skillDevelopment?: { name?: string }[];
  modifiedGame?: { name?: string };
  coolDown?: { name?: string };
}

function ProgramContentSection({ content }: { content: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const data = content as ProgramContentData;

  const activities: string[] = [];
  if (data.warmUp?.name) activities.push(`Warm-up: ${data.warmUp.name}`);
  if (data.skillDevelopment) {
    data.skillDevelopment.forEach((d) => {
      if (d.name) activities.push(d.name);
    });
  }
  if (data.modifiedGame?.name) activities.push(`Game: ${data.modifiedGame.name}`);
  if (data.coolDown?.name) activities.push(`Cool-down: ${data.coolDown.name}`);

  const hasObjectives = data.objectives && data.objectives.length > 0;
  const hasActivities = activities.length > 0;

  if (!hasObjectives && !hasActivities) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? "Hide" : "Show"} program details
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-md bg-gray-50 p-3 text-xs">
          {hasObjectives && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide">
                Learning Objectives
              </p>
              <ul className="space-y-0.5 text-foreground">
                {data.objectives!.map((obj, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-portal-400" />
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasActivities && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide">
                Activities
              </p>
              <ul className="space-y-0.5 text-foreground">
                {activities.map((act, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-portal-400" />
                    {act}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ScopeSequenceView({ weeks, centreType }: ScopeSequenceViewProps) {
  const initialOpen = weeks.reduce<Record<number, boolean>>((acc, week) => {
    acc[week.weekNumber] = isCurrentWeek(week.weekStartDate);
    return acc;
  }, {});

  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>(initialOpen);

  function toggleWeek(weekNum: number) {
    setOpenWeeks((prev) => ({ ...prev, [weekNum]: !prev[weekNum] }));
  }

  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const isOpen = !!openWeeks[week.weekNumber];
        const current = isCurrentWeek(week.weekStartDate);

        return (
          <div
            key={week.weekNumber}
            className={`overflow-hidden rounded-xl border ${current ? "border-portal-300 ring-1 ring-portal-200" : "border-border"}`}
          >
            {/* Week header */}
            <button
              onClick={() => toggleWeek(week.weekNumber)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${current ? "bg-portal-50 hover:bg-portal-100/70" : "bg-muted/30 hover:bg-muted/60"}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-semibold text-sm text-foreground">
                  Week {week.weekNumber}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatWeekRange(week.weekStartDate)}
                </span>
                {current && (
                  <Badge className="bg-portal-500 text-white text-xs">Current</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {week.sessions.length} session{week.sessions.length !== 1 ? "s" : ""}
                </Badge>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Sessions */}
            {isOpen && (
              <div className="divide-y divide-border">
                {week.sessions.map((session) => (
                  <div key={session.id} className="bg-background p-4 space-y-3">
                    {/* Top row: date, sport, status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDateNice(session.date)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={sportColour(session.sport)}
                      >
                        {session.sport}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={statusColour(session.status)}
                      >
                        {statusLabel(session.status)}
                      </Badge>
                    </div>

                    {/* Program title */}
                    {session.program_title && (
                      <p className="text-sm font-medium text-foreground">
                        {session.program_title}
                      </p>
                    )}

                    {/* Meta: coach + duration */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        Coach {session.coach_name.split(" ")[0]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {session.duration_minutes} min
                      </span>
                    </div>

                    {/* Curriculum outcomes */}
                    {session.outcomes && session.outcomes.length > 0 && (
                      <OutcomeBadges outcomes={session.outcomes} compact />
                    )}

                    {/* Program content (expandable) */}
                    {session.program_content && (
                      <ProgramContentSection content={session.program_content} />
                    )}

                    {/* Educator reflection (completed sessions only) */}
                    {session.status === "completed" && (
                      <SessionReflection
                        sessionId={session.id}
                        centreType={centreType}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
