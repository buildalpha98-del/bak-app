"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { History, ChevronLeft, ArrowRight, Loader2 } from "lucide-react";
import { getSchedulingRunHistory, resolveAdjustmentNames } from "@/lib/scheduling/actions";
import type {
  SchedulingRunOutputSummary,
  SchedulingAdjustment,
  SchedulingRun,
} from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface RunRow {
  id: string;
  term_id: string;
  week_start: string;
  week_end: string;
  input_summary: Record<string, unknown>;
  output_summary: SchedulingRunOutputSummary;
  adjustments_json: SchedulingAdjustment[];
  status: string;
  generated_at: string;
  published_at: string | null;
  created_by: string;
}

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatWeek(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sStr = s.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const eStr = e.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${sStr} \u2013 ${eStr}`;
}

function confidenceColour(
  breakdown: SchedulingRunOutputSummary["confidence_breakdown"]
): "green" | "amber" | "red" {
  const total = breakdown.green + breakdown.amber + breakdown.red;
  if (total === 0) return "green";
  if (breakdown.red / total > 0.3) return "red";
  if (breakdown.amber / total > 0.3) return "amber";
  return "green";
}

const CONFIDENCE_STYLES: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  generated: "bg-blue-100 text-blue-700",
  reviewed: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
};

// ============================================================
// Component
// ============================================================

interface AiHistoryViewProps {
  initialRuns?: RunRow[];
}

export function AiHistoryView({ initialRuns }: AiHistoryViewProps) {
  const [runs, setRuns] = useState<RunRow[]>(initialRuns ?? []);
  const [loading, setLoading] = useState(!initialRuns);
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null);

  useEffect(() => {
    if (!initialRuns) {
      getSchedulingRunHistory(30).then((data) => {
        setRuns(data as unknown as RunRow[]);
        setLoading(false);
      });
    }
  }, [initialRuns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading scheduling history...
        </span>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <History className="mx-auto mb-3 size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No scheduling runs recorded yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead className="text-center">Sessions</TableHead>
              <TableHead className="text-center">Confidence</TableHead>
              <TableHead className="text-center hidden sm:table-cell">
                Adjustments
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const summary = run.output_summary;
              const adjustments = run.adjustments_json ?? [];
              const confidence = summary
                ? confidenceColour(summary.confidence_breakdown)
                : "green";

              return (
                <TableRow
                  key={run.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRun(run)}
                >
                  <TableCell className="font-medium">
                    {formatWeek(run.week_start, run.week_end)}
                  </TableCell>
                  <TableCell className="text-center">
                    {summary
                      ? summary.assigned_count + summary.unassigned_count
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-center">
                    {summary ? (
                      <Badge
                        variant="outline"
                        className={CONFIDENCE_STYLES[confidence]}
                      >
                        {summary.confidence_breakdown.green}G /{" "}
                        {summary.confidence_breakdown.amber}A /{" "}
                        {summary.confidence_breakdown.red}R
                      </Badge>
                    ) : (
                      "\u2014"
                    )}
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    {adjustments.length > 0 ? (
                      <Badge variant="secondary">{adjustments.length}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLES[run.status] ?? ""}
                    >
                      {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {run.published_at ? formatDate(run.published_at) : "\u2014"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={!!selectedRun}
        onOpenChange={(open) => !open && setSelectedRun(null)}
      >
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          {selectedRun && (
            <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ============================================================
// Run Detail
// ============================================================

function RunDetail({
  run,
  onClose,
}: {
  run: RunRow;
  onClose: () => void;
}) {
  const summary = run.output_summary;
  const adjustments = run.adjustments_json ?? [];

  const [coachNames, setCoachNames] = useState<Record<string, string>>({});
  const [sessionLabels, setSessionLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (adjustments.length === 0) return;
    const coachIds = adjustments
      .flatMap((a) => [a.original_coach_id, a.replacement_coach_id])
      .filter((id): id is string => !!id);
    const sessionIds = adjustments.map((a) => a.session_id);
    resolveAdjustmentNames(coachIds, sessionIds).then(({ coachNames: cn, sessionLabels: sl }) => {
      setCoachNames(cn);
      setSessionLabels(sl);
    });
  }, [adjustments]);

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          Scheduling Run: {formatWeek(run.week_start, run.week_end)}
        </SheetTitle>
        <SheetDescription>
          Generated {formatDate(run.generated_at)}
          {run.published_at && ` \u00b7 Published ${formatDate(run.published_at)}`}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-4 pt-2">
        {/* Summary */}
        {summary && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Assignment Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Assigned</p>
                  <p className="text-lg font-semibold text-green-700">
                    {summary.assigned_count}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Unassigned</p>
                  <p className="text-lg font-semibold text-red-700">
                    {summary.unassigned_count}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Confidence Breakdown
                </p>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-green-500" />
                    <span className="text-sm">
                      {summary.confidence_breakdown.green} green
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-amber-500" />
                    <span className="text-sm">
                      {summary.confidence_breakdown.amber} amber
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-red-500" />
                    <span className="text-sm">
                      {summary.confidence_breakdown.red} red
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Adjustments */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">
            Adjustments ({adjustments.length})
          </h3>

          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No manual adjustments were made to this run.
            </p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((adj, i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">
                        Session
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {sessionLabels[adj.session_id] ?? adj.session_id.slice(0, 8) + "..."}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {adj.original_coach_id
                          ? coachNames[adj.original_coach_id] ?? "Unknown Coach"
                          : "Unassigned"}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {coachNames[adj.replacement_coach_id] ?? "Unknown Coach"}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Score: {adj.original_score}</span>
                      <span>
                        {new Date(adj.adjusted_at).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
