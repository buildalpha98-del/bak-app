"use client";

import { useState } from "react";
import {
  Star,
  MessageSquare,
  CheckCircle,
  Send,
  Hourglass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "@/components/client/feedback-form";
import { ClientPortalPulseStrip } from "@/components/client/client-status-pulse";
import type { SessionForFeedback } from "@/lib/client/feedback-actions";
import type { ClientPortalPulse } from "@/lib/client/status-pulse-actions";

interface FeedbackPageClientProps {
  sessions: SessionForFeedback[];
  centreId: string;
  ratedCount: number;
  totalCount: number;
  pulse: ClientPortalPulse;
}

function formatDateNice(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatWeekOf(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  // Get start of week (Monday)
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getWeekKey(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function groupByWeek(sessions: SessionForFeedback[]): Map<string, SessionForFeedback[]> {
  const map = new Map<string, SessionForFeedback[]>();
  for (const session of sessions) {
    const key = getWeekKey(session.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(session);
  }
  return map;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
          }`}
        />
      ))}
    </span>
  );
}

function SessionFeedbackCard({
  session,
  centreId,
  expanded,
  onToggle,
  onSubmitted,
}: {
  session: SessionForFeedback;
  centreId: string;
  expanded: boolean;
  onToggle: () => void;
  onSubmitted: (sessionId: string) => void;
}) {
  const isRated = session.existingRating !== null;

  return (
    <Card className="overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {formatDateNice(session.date)}
              </span>
              <Badge variant="secondary" className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50">
                {session.sport}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Coach {session.coach_name}</p>

            {isRated && !expanded && (
              <div className="flex flex-col gap-1 pt-1">
                <StarDisplay rating={session.existingRating!} />
                {session.existingComment && (
                  <p className="flex items-start gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2">{session.existingComment}</span>
                  </p>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle className="h-3 w-3" />
                  {session.acknowledgedAt
                    ? "Rated · Seen by the BAK team"
                    : "Rated"}
                </span>
              </div>
            )}
          </div>

          <div className="shrink-0 pt-0.5">
            {isRated ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="text-[#0891B2] hover:bg-[#0891B2]/10 hover:text-[#0891B2]"
              >
                {expanded ? "Close" : "Edit"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onToggle}
                className="bg-[#0891B2] text-white hover:bg-[#0891B2]/90"
              >
                {expanded ? "Close" : "Rate this session"}
              </Button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-4">
            <FeedbackForm
              session={session}
              centreId={centreId}
              onSubmitted={() => onSubmitted(session.id)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FeedbackPageClient({
  sessions,
  centreId,
  ratedCount,
  totalCount,
  pulse,
}: FeedbackPageClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Track locally submitted sessions so rated count updates after submission
  const [localRated, setLocalRated] = useState<Set<string>>(new Set());

  const currentRatedCount = ratedCount + localRated.size;
  const progressPercent = totalCount > 0 ? Math.round((currentRatedCount / totalCount) * 100) : 0;

  const weekGroups = groupByWeek(sessions);
  // Sort weeks descending (most recent first)
  const sortedWeeks = Array.from(weekGroups.entries()).sort(([a], [b]) =>
    b.localeCompare(a)
  );

  function handleToggle(sessionId: string) {
    setExpandedId((prev) => (prev === sessionId ? null : sessionId));
  }

  function handleSubmitted(sessionId: string) {
    setLocalRated((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    // Collapse the form after a brief delay to show success state
    setTimeout(() => setExpandedId(null), 1800);
  }

  // Build "recent submissions" list — sessions that have a rating.
  const recentSubmissions = sessions
    .filter((s) => s.existingRating !== null)
    .slice(0, 5);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Session Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rate your recent sessions to help us improve.
        </p>
      </div>

      {/* Pulse strip */}
      <ClientPortalPulseStrip
        stats={[
          {
            icon: Send,
            count: pulse.feedbackSubmittedThisTermCount,
            label: "submitted this term",
          },
          {
            icon: Hourglass,
            count: pulse.feedbackPendingCount,
            label: "awaiting your rating",
          },
        ]}
      />

      {/* Summary card */}
      <Card className="rounded-2xl transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Feedback Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sessions rated</span>
            <span className="font-semibold tabular-nums text-foreground">
              {currentRatedCount} of {totalCount}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#0891B2] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground">
              No completed sessions in the last 30 days.
            </p>
          )}
          {totalCount > 0 && currentRatedCount === totalCount && (
            <p className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle className="h-3.5 w-3.5" />
              All sessions rated — thanks!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent submissions — proves the loop closed */}
      {recentSubmissions.length > 0 && (
        <Card className="rounded-2xl transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-4 w-4 text-[#0891B2]" />
              Recent submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recentSubmissions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border bg-background px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50"
                    >
                      {s.sport}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatDateNice(s.date)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · Coach {s.coach_name}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-3.5 w-3.5 ${
                          star <= (s.existingRating ?? 0)
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sessions grouped by week */}
      {sortedWeeks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">No sessions to rate</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Completed sessions from the last 30 days will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedWeeks.map(([weekKey, weekSessions]) => (
            <div key={weekKey} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Week of {formatWeekOf(weekSessions[0].date)}
              </h2>
              <div className="space-y-3">
                {weekSessions.map((session) => (
                  <SessionFeedbackCard
                    key={session.id}
                    session={session}
                    centreId={centreId}
                    expanded={expandedId === session.id}
                    onToggle={() => handleToggle(session.id)}
                    onSubmitted={handleSubmitted}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
