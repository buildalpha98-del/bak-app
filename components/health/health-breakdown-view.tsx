"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthScoreBadge } from "./health-score-badge";
import { getCentreHealthHistory } from "@/lib/health/actions";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface SignalBreakdown {
  signal_name: string;
  weight: number;
  score: number;
  status: string;
}

interface HealthHistoryEntry {
  id: string;
  score: number;
  status: string;
  calculated_at: string;
  breakdown: SignalBreakdown[];
}

interface HealthHistoryResponse {
  current: HealthHistoryEntry | null;
  history: HealthHistoryEntry[];
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function formatSignalName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColourClass(status: string): string {
  switch (status) {
    case "green":
      return "text-[#22C55E]";
    case "amber":
      return "text-[#F59E0B]";
    case "red":
      return "text-[#EF4444]";
    default:
      return "text-muted-foreground";
  }
}

function statusDotClass(status: string): string {
  switch (status) {
    case "green":
      return "bg-[#22C55E]";
    case "amber":
      return "bg-[#F59E0B]";
    case "red":
      return "bg-[#EF4444]";
    default:
      return "bg-muted";
  }
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

interface HealthBreakdownViewProps {
  centreId: string;
}

export function HealthBreakdownView({ centreId }: HealthBreakdownViewProps) {
  const [data, setData] = useState<HealthHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await getCentreHealthHistory(centreId);

      if (cancelled) return;

      if (result.error) {
        setError(result.error);
      } else {
        const scores = result.data ?? [];
        const current = scores[0]
          ? {
              id: scores[0].id,
              score: scores[0].score,
              status: scores[0].status,
              calculated_at: scores[0].calculated_at,
              breakdown: (scores[0].breakdown_json ?? []) as unknown as SignalBreakdown[],
            }
          : null;
        const history = scores.slice(1).map((s) => ({
          id: s.id,
          score: s.score,
          status: s.status,
          calculated_at: s.calculated_at,
          breakdown: (s.breakdown_json ?? []) as unknown as SignalBreakdown[],
        }));
        setData(current ? { current, history } : null);
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [centreId]);

  // Loading state
  if (loading) {
    return (
      <div className="animate-fade-up space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="animate-fade-up">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-red-600">
              Failed to load health data: {error}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No data
  if (!data || !data.current) {
    return (
      <div className="animate-fade-up">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <span className="text-lg text-muted-foreground">&mdash;</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              No health score available
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Health scores will appear after the first calculation run.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { current, history } = data;

  return (
    <div className="animate-fade-up space-y-6">
      {/* Current score */}
      <Card>
        <CardHeader>
          <CardTitle>Current Health Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white ${statusDotClass(current.status)}`}
            >
              {current.score}
            </div>
            <div>
              <p className={`text-lg font-semibold capitalize ${statusColourClass(current.status)}`}>
                {current.status}
              </p>
              <p className="text-sm text-muted-foreground">
                Last calculated {formatDateTime(current.calculated_at)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signal breakdown */}
      {current.breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Signal Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Signal</TableHead>
                    <TableHead className="w-[80px]">Weight</TableHead>
                    <TableHead className="w-[80px]">Score</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.breakdown.map((signal) => (
                    <TableRow key={signal.signal_name}>
                      <TableCell className="font-medium">
                        {formatSignalName(signal.signal_name)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {Math.round(signal.weight * 100)}%
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${statusColourClass(signal.status)}`}>
                          {signal.score}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${statusDotClass(signal.status)}`}
                          />
                          <span className="text-sm capitalize text-muted-foreground">
                            {signal.status}
                          </span>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[80px]">Score</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(entry.calculated_at)}
                      </TableCell>
                      <TableCell>
                        <HealthScoreBadge
                          score={entry.score}
                          status={entry.status}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${statusDotClass(entry.status)}`}
                          />
                          <span className="text-sm capitalize text-muted-foreground">
                            {entry.status}
                          </span>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
