"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, CalendarDays, Package, Megaphone } from "lucide-react";
import { SessionStatusBadge } from "@/components/roster/session-status-badge";
import { StatusBroadcastSheet } from "@/components/coach/schedule/status-broadcast-sheet";
import { formatTime12 } from "@/lib/utils/roster";
import { sportColour } from "@/lib/utils/sport-colours";
import type { CoachSessionWithCentre } from "@/lib/sessions/coach-actions";
import type { SessionStatusBroadcast } from "@/lib/sessions/status-broadcast-actions";

// ============================================================
// Helpers
// ============================================================

function getEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.slice(0, 5).split(":").map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

// ============================================================
// Props
// ============================================================

interface TodayViewProps {
  sessions: CoachSessionWithCentre[];
  /** YYYY-MM-DD of next session date if no sessions today */
  nextSessionDate?: string | null;
}

// ============================================================
// Component
// ============================================================

export function TodayView({ sessions, nextSessionDate }: TodayViewProps) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [recent, setRecent] = useState<
    Record<string, SessionStatusBroadcast | undefined>
  >({});

  if (sessions.length === 0) {
    return (
      <div className="py-12 text-center">
        <CalendarDays className="mx-auto size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">
          No sessions today
        </p>
        {nextSessionDate && (
          <p className="mt-1 text-xs text-muted-foreground">
            Your next session is on{" "}
            <span className="font-medium">{formatRelativeDate(nextSessionDate)}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Timeline line */}
      <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-border" />

      {sessions.map((session, i) => {
        const colour = sportColour(session.sport);
        const timeStart = formatTime12(session.time.slice(0, 5));
        const timeEnd = formatTime12(
          getEndTime(session.time, session.duration_minutes)
        );

        const recentBroadcast = recent[session.id];

        return (
          <div key={session.id} className="relative flex gap-3 pb-3">
            {/* Timeline dot */}
            <div className="relative z-10 flex flex-col items-center pt-4">
              <span
                className="size-3 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: colour }}
              />
            </div>

            {/* Session card */}
            <div className="min-w-0 flex-1 relative">
              <Link href={`/coach/schedule/${session.id}`} className="block">
                <Card className="card-hover rounded-2xl transition-all active:shadow-md min-h-[44px] hover:-translate-y-0.5 hover:border-primary/30">
                  <CardContent className="p-3 space-y-2">
                    {/* Time range */}
                    <div className="flex items-center justify-between pr-10">
                      <span className="text-sm font-medium text-foreground">
                        {timeStart} — {timeEnd}
                      </span>
                      <SessionStatusBadge status={session.status} />
                    </div>

                    {/* Centre + Address */}
                    <div>
                      <p className="text-sm text-foreground">
                        {session.centre_name}
                      </p>
                      {session.centre_address && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">
                            {session.centre_address}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Sport + Equipment */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: colour }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {session.sport}
                        </span>
                      </div>
                      {session.equipment_kit_name && (
                        <div className="flex items-center gap-1">
                          <Package className="size-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {session.equipment_kit_name}
                          </span>
                        </div>
                      )}
                      {recentBroadcast && (
                        <Badge
                          variant="secondary"
                          className="ml-auto rounded-full text-[10px] font-medium uppercase tracking-wide"
                        >
                          Broadcast sent
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* Megaphone trigger — overlays card so the Link wrap isn't broken */}
              <button
                type="button"
                aria-label="Broadcast status"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenSessionId(session.id);
                }}
                className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm backdrop-blur hover:bg-primary/10 hover:text-primary"
              >
                <Megaphone className="size-4" />
              </button>
            </div>
          </div>
        );
      })}

      {openSessionId && (
        <StatusBroadcastSheet
          sessionId={openSessionId}
          open={!!openSessionId}
          onOpenChange={(o) => {
            if (!o) setOpenSessionId(null);
          }}
          onBroadcastSent={(b) =>
            setRecent((prev) => ({ ...prev, [b.session_id]: b }))
          }
        />
      )}
    </div>
  );
}

// ============================================================
// Date helper (inline — same as next-session-card)
// ============================================================

function formatRelativeDate(dateStr: string): string {
  const today = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const diffDays = Math.round(
    (target.getTime() - todayStart.getTime()) / 86400000
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${dayNames[target.getDay()]} ${target.getDate()} ${months[target.getMonth()]}`;
}
