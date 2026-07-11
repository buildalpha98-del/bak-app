"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  TrendingUp,
  AlertCircle,
  CalendarDays,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  getLeadAnalytics,
  type LeadAnalytics,
} from "@/lib/crm/trial-actions";

// ============================================================
// Helpers
// ============================================================

function formatStageLabel(stage: string): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

// ============================================================
// Loading Skeleton
// ============================================================

function AnalyticsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-12 w-24" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-3 rounded-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component
// ============================================================

interface LeadAnalyticsCardProps {
  leadId: string;
}

export function LeadAnalyticsCard({ leadId }: LeadAnalyticsCardProps) {
  const [data, setData] = useState<LeadAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await getLeadAnalytics(leadId);
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

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertCircle className="size-6 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setError(null);
                getLeadAnalytics(leadId).then((r) => {
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

  if (!data) return null;

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4 text-primary" />
          Lead Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Key duration metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3" />
              Current Stage
            </div>
            <span className="text-lg font-semibold text-primary">
              {pluralise(data.daysInCurrentStage, "day")}
            </span>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3" />
              Total Pipeline
            </div>
            <span className="text-lg font-semibold text-foreground">
              {pluralise(data.totalDaysSinceCreated, "day")}
            </span>
          </div>
        </div>

        {/* Trial conversion rate */}
        {data.trialConversionRate != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Trial conversion rate:
            </span>
            <Badge
              variant={data.trialConversionRate >= 50 ? "default" : "secondary"}
            >
              {data.trialConversionRate}%
            </Badge>
          </div>
        )}

        {/* Stage history timeline */}
        {data.stageHistory.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">
              Stage History
            </h3>
            <div className="relative space-y-0">
              {data.stageHistory.map((entry, idx) => {
                const isLast = idx === data.stageHistory.length - 1;
                return (
                  <div key={idx} className="flex gap-3">
                    {/* Vertical line + dot */}
                    <div className="flex flex-col items-center">
                      <div className="flex size-3 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-card mt-1" />
                      {!isLast && (
                        <div className="w-px flex-1 bg-border min-h-[24px]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className={`pb-4 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {formatStageLabel(entry.stage)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {pluralise(entry.durationDays, "day")}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.enteredAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
