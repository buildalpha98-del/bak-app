"use client";

import { useState } from "react";
import Link from "@/components/ui/app-link";
import {
  Calendar,
  CalendarDays,
  Clock,
  Users,
  Star,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClientSession } from "@/lib/client/portal-actions";

interface ClientScheduleProps {
  upcoming: ClientSession[];
  past: ClientSession[];
  centreId: string;
}

function formatDateNice(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "pending_confirmation":
      return "Pending";
    case "published":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusColour(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-700";
    case "pending_confirmation":
      return "bg-amber-50 text-amber-700";
    case "published":
      return "bg-cyan-50 text-cyan-700";
    case "in_progress":
      return "bg-blue-50 text-blue-700";
    case "completed":
      return "bg-gray-100 text-gray-600";
    case "cancelled":
      return "bg-red-50 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function renderStars(rating: number | null) {
  if (rating === null) return null;
  const full = Math.floor(rating);
  const stars = [];
  for (let i = 0; i < 5; i++) {
    stars.push(
      <Star
        key={i}
        className={`h-3 w-3 ${
          i < full ? "fill-amber-400 text-amber-400" : "text-gray-200"
        }`}
      />
    );
  }
  return <span className="inline-flex items-center gap-0.5">{stars}</span>;
}

function coachFirstName(name: string | null): string {
  if (!name) return "TBC";
  return name.split(" ")[0];
}

function SessionCard({
  session,
  centreId,
  showMeta,
}: {
  session: ClientSession;
  centreId: string;
  showMeta: boolean;
}) {
  return (
    <Card className="rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Date and time row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {formatDateFull(session.date)}
              </span>
              <Badge variant="secondary" className={statusColour(session.status)}>
                {statusLabel(session.status)}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(session.time)}
                <span className="text-xs">({session.duration_minutes} min)</span>
              </span>
            </div>

            {/* Sport and coach */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50"
              >
                {session.sport}
              </Badge>
              {session.class_names.map((name) => (
                <Badge key={name} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
              <span className="text-sm text-muted-foreground">
                Coach {coachFirstName(session.coach_name)}
              </span>
            </div>

            {/* Program title */}
            {session.program_title && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                {session.program_title}
              </p>
            )}

            {/* Past session meta: headcount and rating */}
            {showMeta && (
              <div className="flex items-center gap-4 pt-1">
                {session.headcount !== null && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {session.headcount} children
                  </span>
                )}
                {renderStars(session.rating)}
              </div>
            )}
          </div>

          {/* View button */}
          <div className="shrink-0 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-[#0891B2] hover:bg-[#0891B2]/10 hover:text-[#0891B2]"
              render={
                <Link href={`/client/${centreId}/schedule/${session.id}`} />
              }
            >
              <span className="hidden sm:inline">View</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ type }: { type: "upcoming" | "past" }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {type === "upcoming" ? (
        <>
          <CalendarDays className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            No upcoming sessions
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            New sessions will appear here once they are scheduled for your centre.
          </p>
        </>
      ) : (
        <>
          <Calendar className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            No past sessions
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Completed sessions will appear here after they have been delivered.
          </p>
        </>
      )}
    </div>
  );
}

export function ClientSchedule({ upcoming, past, centreId }: ClientScheduleProps) {
  const [tab, setTab] = useState<string>("upcoming");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v ?? "upcoming")}>
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="upcoming" className="flex-1 sm:flex-initial">
          Upcoming
          {upcoming.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-2 bg-cyan-100 text-cyan-700 hover:bg-cyan-100"
            >
              {upcoming.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="past" className="flex-1 sm:flex-initial">
          Past
          {past.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {past.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming" className="mt-4">
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                centreId={centreId}
                showMeta={false}
              />
            ))}
          </div>
        ) : (
          <EmptyState type="upcoming" />
        )}
      </TabsContent>

      <TabsContent value="past" className="mt-4">
        {past.length > 0 ? (
          <div className="space-y-3">
            {past.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                centreId={centreId}
                showMeta={true}
              />
            ))}
          </div>
        ) : (
          <EmptyState type="past" />
        )}
      </TabsContent>
    </Tabs>
  );
}
