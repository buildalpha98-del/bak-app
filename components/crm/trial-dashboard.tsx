"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Star,
  Users,
  Trophy,
  BarChart3,
  FileText,
  CalendarDays,
  MessageSquare,
  Loader2,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTrialPerformance,
  type TrialPerformance,
} from "@/lib/crm/trial-actions";

// ============================================================
// Helpers
// ============================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "completed":
      return "default";
    case "cancelled":
      return "destructive";
    case "in_progress":
      return "secondary";
    default:
      return "outline";
  }
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${
            i < Math.round(rating)
              ? "fill-primary text-primary"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ============================================================
// Loading Skeleton
// ============================================================

function TrialDashboardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
        {/* Session list */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component
// ============================================================

interface TrialDashboardProps {
  leadId: string;
}

export function TrialDashboard({ leadId }: TrialDashboardProps) {
  const [data, setData] = useState<TrialPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await getTrialPerformance(leadId);
      if (cancelled) return;

      if (result.error) {
        setError(result.error);
      } else {
        setData(result.data);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) return <TrialDashboardSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setError(null);
                getTrialPerformance(leadId).then((r) => {
                  if (r.error) setError(r.error);
                  else setData(r.data);
                  setLoading(false);
                });
              }}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalSessions === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            Trial Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ClipboardList className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No trial sessions recorded yet. Sessions will appear here once they
              are scheduled and delivered.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sessionsWithNotes = data.sessions.filter((s) => s.coach_notes);

  return (
    <div className="space-y-4 animate-fade-up">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            Trial Performance
          </CardTitle>
          <CardDescription>
            {data.completedSessions} of {data.totalSessions} sessions completed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              icon={CalendarDays}
              label="Sessions Delivered"
              value={data.completedSessions}
            />
            <MetricCard
              icon={Users}
              label="Avg Attendance"
              value={data.averageAttendance}
            />
            <MetricCard
              icon={Trophy}
              label="Sports Covered"
              value={data.sportsCovered.length}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Star className="size-3" />
                <span>Avg Rating</span>
              </div>
              {data.averageRating != null ? (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold text-primary">
                    {data.averageRating}
                  </span>
                  <StarRating rating={data.averageRating} />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No ratings</span>
              )}
            </div>
          </div>

          {/* Session list */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Sessions</h3>
            <div className="space-y-2">
              {data.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(session.date)}
                    </span>
                    <Badge variant="outline">{session.sport}</Badge>
                    {session.coach_name && (
                      <span className="text-sm text-foreground truncate">
                        {session.coach_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {session.headcount != null && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3" />
                        {session.headcount}
                      </span>
                    )}
                    <Badge variant={statusVariant(session.status)}>
                      {formatStatus(session.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feedback */}
          {data.feedbackEntries.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Star className="size-3.5 text-primary" />
                Feedback
              </h3>
              <div className="space-y-2">
                {data.feedbackEntries.map((fb, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <StarRating rating={fb.rating} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(fb.session_date)}
                      </span>
                    </div>
                    {fb.comment && (
                      <p className="text-sm text-foreground">{fb.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coach observations */}
          {sessionsWithNotes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <MessageSquare className="size-3.5 text-primary" />
                Coach Observations
              </h3>
              <div className="space-y-2">
                {sessionsWithNotes.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-lg border p-3 space-y-1"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(session.date)}</span>
                      {session.coach_name && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span>{session.coach_name}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {session.coach_notes}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate report */}
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Report generation coming soon"
            >
              <FileText className="size-3.5" />
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Metric Card sub-component
// ============================================================

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <span className="text-xl font-semibold text-primary">{value}</span>
    </div>
  );
}
