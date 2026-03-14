"use client";

import Link from "next/link";
import {
  Calendar,
  Clock,
  Users,
  Star,
  TrendingUp,
  ArrowRight,
  Activity,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientDashboardData } from "@/lib/client/portal-actions";

interface ClientDashboardProps {
  data: ClientDashboardData;
  centreId: string;
}

function formatDateNice(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function renderStars(rating: number | null) {
  if (rating === null) return <span className="text-sm text-muted-foreground">--</span>;
  const full = Math.floor(rating);
  const stars = [];
  for (let i = 0; i < 5; i++) {
    stars.push(
      <Star
        key={i}
        className={`h-3.5 w-3.5 ${
          i < full ? "fill-amber-400 text-amber-400" : "text-gray-200"
        }`}
      />
    );
  }
  return <span className="inline-flex items-center gap-0.5">{stars}</span>;
}

export function ClientDashboard({ data, centreId }: ClientDashboardProps) {
  const { centreName, nextSession, stats, recentSessions } = data;
  const days = nextSession ? daysUntil(nextSession.date) : null;

  return (
    <div className="animate-fade-up space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Welcome back
        </h1>
        <p className="mt-1 text-muted-foreground">{centreName}</p>
      </div>

      {/* Next session card */}
      {nextSession ? (
        <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-white">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-cyan-600">
                  Next Session
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {formatDateNice(nextSession.date)}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(nextSession.time)}
                  </span>
                  <Badge
                    variant="secondary"
                    className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100"
                  >
                    {nextSession.sport}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Coach: {nextSession.coach_name}
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-white px-3 py-2 shadow-sm">
                {days !== null && days >= 0 ? (
                  <>
                    <span className="text-2xl font-bold text-cyan-600">{days}</span>
                    <span className="text-xs text-muted-foreground">
                      {days === 1 ? "day" : "days"}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-cyan-600">Today</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 -ml-2"
                render={<Link href={`/client/${centreId}/schedule`} />}
              >
                View full schedule
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              No upcoming sessions
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sessions will appear here once they are scheduled.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-cyan-50 p-2">
                <Calendar className="h-4 w-4 text-cyan-600" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">
              {stats.sessionsThisTerm}
            </p>
            <p className="text-xs text-muted-foreground">Sessions this term</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-cyan-50 p-2">
                <Users className="h-4 w-4 text-cyan-600" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">
              {stats.totalChildren}
            </p>
            <p className="text-xs text-muted-foreground">Total children</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-50 p-2">
                <Star className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">
              {stats.averageRating !== null ? stats.averageRating.toFixed(1) : "--"}
            </p>
            <p className="text-xs text-muted-foreground">Average rating</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">
              {stats.attendanceRate !== null ? `${stats.attendanceRate}%` : "--"}
            </p>
            <p className="text-xs text-muted-foreground">Attendance rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-cyan-600" />
              Recent Sessions
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
              render={<Link href={`/client/${centreId}/schedule`} />}
            >
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/client/${centreId}/schedule/${session.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="hidden sm:block shrink-0 text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        {formatDateShort(session.date)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50 shrink-0"
                        >
                          {session.sport}
                        </Badge>
                        <span className="text-sm text-muted-foreground truncate sm:hidden">
                          {formatDateShort(session.date)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {session.coach_name}
                        {session.headcount !== null && (
                          <span className="ml-2">
                            <Users className="inline h-3 w-3 mr-0.5" />
                            {session.headcount}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 ml-2">{renderStars(session.rating)}</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                No completed sessions yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Session history will appear here after your first session.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
