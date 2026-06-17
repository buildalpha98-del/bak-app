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
  FileText,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/components/launch/use-count-up";
import { ClientHomePulseStrip } from "@/components/client/client-status-pulse";
import { CalendarSubscribeButton } from "@/components/calendar/calendar-subscribe-button";
import { MultiCentreRollUp } from "@/components/client/multi-centre-roll-up";
import type { ClientDashboardData } from "@/lib/client/portal-actions";
import type { ClientStatusPulse } from "@/lib/client/status-pulse-actions";
import type { ClientUserCentreSummary } from "@/lib/client/actions";

interface ClientDashboardProps {
  data: ClientDashboardData;
  centreId: string;
  pulse: ClientStatusPulse;
  /** Calendar feed URL (null when token couldn't be issued — hides button). */
  calendarFeedUrl?: string | null;
  /** All centres this director can access. Drives the optional roll-up. */
  centresSummary?: ClientUserCentreSummary[];
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

export function ClientDashboard({
  data,
  centreId,
  pulse,
  calendarFeedUrl,
  centresSummary = [],
}: ClientDashboardProps) {
  const { centreName, nextSession, stats, recentSessions } = data;
  const days = nextSession ? daysUntil(nextSession.date) : null;

  return (
    <div className="animate-fade-up space-y-6">
      {/* Welcome + calendar subscribe */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">
            Welcome, {centreName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s on at your centre this week.
          </p>
        </div>
        {calendarFeedUrl && (
          <CalendarSubscribeButton
            feedUrl={calendarFeedUrl}
            label={`${centreName}'s schedule`}
          />
        )}
      </div>

      {/* Status pulse */}
      <ClientHomePulseStrip pulse={pulse} centreId={centreId} />

      {/* Multi-centre roll-up — only renders when the director can access >1 centre */}
      <MultiCentreRollUp centres={centresSummary} currentCentreId={centreId} />

      {/* Quick actions row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction
          href={`/client/${centreId}/schedule`}
          icon={Calendar}
          label="View Schedule"
        />
        <QuickAction
          href={`/client/${centreId}/reports`}
          icon={FileText}
          label="Open Reports"
        />
        <QuickAction
          href={`/client/${centreId}/feedback`}
          icon={Star}
          label="Submit Feedback"
        />
        <QuickAction
          href={`/client/${centreId}/children`}
          icon={Users}
          label="View Children"
        />
      </div>

      {/* Next session card */}
      {nextSession ? (
        <Card className="rounded-2xl border-[#E8712A]/20 bg-gradient-to-br from-[#FFF3EA] to-white transition-shadow hover:shadow-md">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-[#E8712A]">
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
                    className="bg-white text-[#E8712A] hover:bg-white border border-[#E8712A]/30"
                  >
                    {nextSession.sport}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Coach: {nextSession.coach_name}
                </p>
              </div>

              <div className="flex flex-col items-center rounded-2xl bg-white px-3 py-2 shadow-sm">
                {days !== null && days >= 0 ? (
                  <>
                    <span className="text-2xl font-bold tabular-nums text-[#E8712A]">
                      {days}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {days === 1 ? "day" : "days"}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-[#E8712A]">Today</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-[#E8712A] hover:bg-[#E8712A]/10 hover:text-[#E8712A]"
                render={<Link href={`/client/${centreId}/schedule`} />}
              >
                View full schedule
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-dashed">
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
        <SummaryCard
          icon={Calendar}
          value={stats.sessionsThisTerm}
          label="Sessions this term"
        />
        <SummaryCard
          icon={Users}
          value={stats.totalChildren}
          label="Total children"
        />
        <RatingCard rating={stats.averageRating} />
        <AttendanceCard rate={stats.attendanceRate} />
      </div>

      {/* Recent activity */}
      <Card className="rounded-2xl transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-[#E8712A]" />
              Recent Sessions
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#E8712A] hover:bg-[#E8712A]/10 hover:text-[#E8712A]"
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
                  className="flex items-center justify-between rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="hidden shrink-0 text-center sm:block">
                      <p className="text-xs font-medium text-muted-foreground">
                        {formatDateShort(session.date)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-cyan-50 text-cyan-700 hover:bg-cyan-50"
                        >
                          {session.sport}
                        </Badge>
                        <span className="truncate text-sm text-muted-foreground sm:hidden">
                          {formatDateShort(session.date)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {session.coach_name}
                        {session.headcount !== null && (
                          <span className="ml-2">
                            <Users className="mr-0.5 inline h-3 w-3" />
                            {session.headcount}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="ml-2 shrink-0">{renderStars(session.rating)}</div>
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

// ============================================================
// Subcomponents
// ============================================================

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Calendar;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-2xl border bg-background p-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-[#E8712A]/40 hover:shadow-sm"
    >
      <Icon className="h-4 w-4 shrink-0 text-[#E8712A]" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SummaryCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Calendar;
  value: number;
  label: string;
}) {
  const ticked = useCountUp(value);
  return (
    <Card className="rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-[#E8712A]/10 p-2">
            <Icon className="h-4 w-4 text-[#E8712A]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
          {ticked}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function RatingCard({ rating }: { rating: number | null }) {
  const tenths = Math.round((rating ?? 0) * 10);
  const ticked = useCountUp(tenths);
  return (
    <Card className="rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-amber-50 p-2">
            <Star className="h-4 w-4 text-amber-500" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
          {rating === null ? "--" : (ticked / 10).toFixed(1)}
        </p>
        <p className="text-xs text-muted-foreground">Average rating</p>
      </CardContent>
    </Card>
  );
}

function AttendanceCard({ rate }: { rate: number | null }) {
  const ticked = useCountUp(rate ?? 0);
  return (
    <Card className="rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-emerald-50 p-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
          {rate === null ? "--" : `${ticked}%`}
        </p>
        <p className="text-xs text-muted-foreground">Attendance rate</p>
      </CardContent>
    </Card>
  );
}
