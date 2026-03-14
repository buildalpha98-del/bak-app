"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Navigation, Dumbbell, ChevronRight } from "lucide-react";

// ============================================================
// Types
// ============================================================

interface TodaySessionCardProps {
  session: {
    id: string;
    centre_name: string;
    centre_address?: string;
    sport: string;
    start_time: string;
    end_time: string;
    status: string;
    headcount?: number;
  };
  isNext: boolean;
}

// ============================================================
// Helpers
// ============================================================

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return "now";
  const totalMin = Math.floor(diffMs / 60000);
  if (totalMin < 60) return `in ${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `in ${hours}h`;
  return `in ${hours}h ${mins}m`;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.slice(0, 5).split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-50 text-green-700";
    case "confirmed":
      return "border-primary/30 bg-[var(--brand-orange-light,#FFF3EB)] text-primary";
    default:
      return "border-muted bg-muted/50 text-muted-foreground";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "confirmed":
      return "Confirmed";
    case "in_progress":
      return "In Progress";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

// ============================================================
// Component
// ============================================================

export function TodaySessionCard({ session, isNext }: TodaySessionCardProps) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!isNext) return;

    function update() {
      const now = Date.now();
      const today = new Date().toISOString().split("T")[0];
      const sessionDT = new Date(`${today}T${session.start_time}`);
      const diffMs = sessionDT.getTime() - now;
      setCountdown(formatCountdown(diffMs));
    }

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [isNext, session.start_time]);

  const timeStart = formatTime12(session.start_time);
  const timeEnd = formatTime12(session.end_time);

  return (
    <Card
      className={
        isNext
          ? "border-primary/30 bg-primary/5 shadow-md glow-orange"
          : "transition-shadow"
      }
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: centre name + status */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {session.centre_name}
          </h3>
          <Badge variant="outline" className={statusBadgeClasses(session.status)}>
            {statusLabel(session.status)}
          </Badge>
        </div>

        {/* Sport + time */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Dumbbell className="size-3.5" />
            <span className="text-xs font-medium">{session.sport}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {timeStart} &ndash; {timeEnd}
          </span>
          {session.headcount != null && (
            <span className="text-xs text-muted-foreground">
              {session.headcount} kids
            </span>
          )}
        </div>

        {/* Countdown badge (next session only) */}
        {isNext && countdown && (
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary text-xs"
          >
            <Clock className="mr-1 size-3" />
            {countdown}
          </Badge>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {session.centre_address && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              nativeButton={false}
              render={
                <a
                  href={directionsUrl(session.centre_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Navigation className="size-4" />
              Directions
            </Button>
          )}
          <div className="flex-1" />
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
