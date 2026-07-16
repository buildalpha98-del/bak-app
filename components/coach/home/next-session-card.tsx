"use client";

import { useState, useEffect } from "react";
import Link from "@/components/ui/app-link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Clock,
  CalendarDays,
  ExternalLink,
  Play,
  BookOpen,
} from "lucide-react";
import { formatTime12 } from "@/lib/utils/roster";
import { sportColour } from "@/lib/utils/sport-colours";
import { startSession } from "@/lib/sessions/session-workflow-actions";
import type { CoachSessionWithCentre } from "@/lib/sessions/coach-actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

function getSessionDateTime(session: CoachSessionWithCentre): Date {
  return new Date(`${session.date}T${session.time}`);
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return "Starting now";
  const totalMin = Math.floor(diffMs / 60000);
  if (totalMin < 60) return `Starts in ${totalMin}min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `Starts in ${hours}h`;
  return `Starts in ${hours}h ${mins}m`;
}

function formatRelativeDate(dateStr: string): string {
  const today = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round(
    (target.getTime() - todayStart.getTime()) / 86400000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${dayNames[target.getDay()]} ${target.getDate()} ${months[target.getMonth()]}`;
}

function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

// ============================================================
// Props
// ============================================================

interface NextSessionCardProps {
  session: CoachSessionWithCentre | null;
}

// ============================================================
// Component
// ============================================================

export function NextSessionCard({ session }: NextSessionCardProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState("");
  const [canStart, setCanStart] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!session) return;

    function update() {
      const sessionDT = getSessionDateTime(session!);
      const now = Date.now();
      const diffMs = sessionDT.getTime() - now;

      if (session!.status === "in_progress") {
        setCountdown("In progress");
        setCanStart(false);
      } else {
        setCountdown(formatCountdown(diffMs));
        setCanStart(
          session!.status === "confirmed" && diffMs <= 30 * 60 * 1000
        );
      }
    }

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CalendarDays className="mx-auto size-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No upcoming sessions
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check back later or contact your coordinator.
          </p>
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const isToday = session.date === today;
  const colour = sportColour(session.sport);
  const timeStart = formatTime12(session.time.slice(0, 5));
  const timeEnd = formatTime12(
    getEndTime(session.time, session.duration_minutes)
  );

  async function handleStart() {
    setStarting(true);
    const { error } = await startSession(session!.id);
    setStarting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Session started!");
      router.push(`/coach/schedule/${session!.id}/active`);
    }
  }

  return (
    <Card className="border-l-4 border-l-primary card-hover">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-semibold">Next Session</CardTitle>
          <Badge
            variant="outline"
            className={
              session.status === "in_progress"
                ? "border-primary/30 bg-[var(--brand-orange-light)] text-primary"
                : "border-blue-200 bg-blue-50 text-blue-700"
            }
          >
            <Clock className="mr-1 size-3" />
            {countdown}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isToday && (
          <p className="text-xs font-semibold text-primary">
            {formatRelativeDate(session.date)}
          </p>
        )}

        <div>
          <p className="text-sm font-medium text-foreground">
            {session.centre_name}
          </p>
          {session.centre_address && (
            <a
              href={mapsUrl(session.centre_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex items-center gap-1 text-xs text-primary active:opacity-70"
            >
              <MapPin className="size-3" />
              <span className="underline">{session.centre_address}</span>
              <ExternalLink className="size-2.5" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: colour }}
            />
            <span className="text-sm text-foreground">{session.sport}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {timeStart} – {timeEnd}
          </span>
          <span className="text-xs text-muted-foreground">
            {session.duration_minutes}min
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] flex-1"
            nativeButton={false}
            render={
              <Link href={`/coach/schedule/${session.id}`} />
            }
          >
            <BookOpen className="size-4" />
            View Programme
          </Button>

          {session.status === "in_progress" && (
            <Button
              size="sm"
              className="min-h-[44px] flex-1 bg-primary hover:bg-primary/90"
              nativeButton={false}
              render={
                <Link href={`/coach/schedule/${session.id}/active`} />
              }
            >
              <Play className="size-4" />
              Resume Session
            </Button>
          )}

          {canStart && (
            <Button
              size="sm"
              className="min-h-[44px] flex-1"
              onClick={handleStart}
              disabled={starting}
            >
              <Play className="size-4" />
              {starting ? "Starting..." : "Start Session"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
