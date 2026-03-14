"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ============================================================
// Constants
// ============================================================

const COMPARISON_COLOURS = ["#E8712A", "#3B82F6", "#10B981"] as const;
const MAX_COMPARE = 3;

const METRIC_LABELS: Record<string, string> = {
  session_volume: "Volume",
  feedback_rating: "Feedback",
  form_completion: "Forms",
  punctuality: "Punctuality",
  shift_reliability: "Reliability",
  assessment_thoroughness: "Assessments",
  equipment_responsibility: "Equipment",
  attendance_consistency: "Attendance",
};

// ============================================================
// Types
// ============================================================

interface CoachComparisonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCoach: {
    id: string;
    name: string;
    normalised: Record<string, number>;
  };
  allCoaches: Array<{
    id: string;
    name: string;
    normalised: Record<string, number>;
  }>;
}

// ============================================================
// Component
// ============================================================

export function CoachComparison({
  open,
  onOpenChange,
  currentCoach,
  allCoaches,
}: CoachComparisonProps) {
  // Selected comparison coach IDs (excluding current coach which is always shown)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const otherCoaches = useMemo(
    () => allCoaches.filter((c) => c.id !== currentCoach.id),
    [allCoaches, currentCoach.id]
  );

  const selectedCoaches = useMemo(
    () =>
      selectedIds
        .map((id) => allCoaches.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [selectedIds, allCoaches]
  );

  const activeCoaches = [currentCoach, ...selectedCoaches];

  // Radar data: one entry per metric axis
  const metricKeys = Object.keys(METRIC_LABELS);

  const radarData = useMemo(
    () =>
      metricKeys.map((key) => {
        const point: Record<string, string | number> = {
          metric: METRIC_LABELS[key] ?? key,
        };
        for (const coach of activeCoaches) {
          point[coach.name] = Math.round(coach.normalised[key] ?? 0);
        }
        return point;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCoaches.map((c) => c.id).join(","), metricKeys.join(",")]
  );

  function addCoach(id: string) {
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= MAX_COMPARE - 1) return; // current coach takes slot 1
    setSelectedIds((prev) => [...prev, id]);
  }

  function removeCoach(id: string) {
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  }

  const canAddMore =
    selectedIds.length < MAX_COMPARE - 1 && otherCoaches.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Coach Comparison</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Coach selector ── */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Compare up to {MAX_COMPARE} coaches. {currentCoach.name} is
              always included.
            </p>

            {/* Current coach tag */}
            <div className="flex flex-wrap gap-2">
              <Badge
                style={{ backgroundColor: COMPARISON_COLOURS[0] }}
                className="text-white gap-1 px-3 py-1"
              >
                {currentCoach.name}
              </Badge>

              {selectedCoaches.map((coach, idx) => (
                <Badge
                  key={coach.id}
                  style={{
                    backgroundColor:
                      COMPARISON_COLOURS[idx + 1] ?? COMPARISON_COLOURS[2],
                  }}
                  className="text-white gap-1 px-3 py-1"
                >
                  {coach.name}
                  <button
                    onClick={() => removeCoach(coach.id)}
                    className="ml-1 hover:opacity-75"
                    aria-label={`Remove ${coach.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>

            {/* Add coach dropdown */}
            {canAddMore && (
              <div className="flex items-center gap-2">
                <Select<string> onValueChange={(val) => { if (val) addCoach(val); }}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Add a coach to compare…" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherCoaches
                      .filter((c) => !selectedIds.includes(c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedIds.length >= MAX_COMPARE - 1 && (
              <p className="text-xs text-muted-foreground">
                Maximum {MAX_COMPARE} coaches selected. Remove one to add
                another.
              </p>
            )}
          </div>

          {/* ── Radar chart ── */}
          {activeCoaches.length >= 1 && (
            <div>
              <h3 className="mb-3 text-sm font-medium">Performance Radar</h3>
              <ResponsiveContainer width="100%" height={340}>
                <RadarChart data={radarData} margin={{ top: 8, bottom: 8 }}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                  />
                  <Tooltip
                    formatter={(value) => [`${Number(value)}`, ""]}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {activeCoaches.map((coach, idx) => (
                    <Radar
                      key={coach.id}
                      name={coach.name}
                      dataKey={coach.name}
                      stroke={COMPARISON_COLOURS[idx] ?? COMPARISON_COLOURS[2]}
                      fill={COMPARISON_COLOURS[idx] ?? COMPARISON_COLOURS[2]}
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Side-by-side metric cards ── */}
          {activeCoaches.length > 1 && (
            <div>
              <h3 className="mb-3 text-sm font-medium">Metric Comparison</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {metricKeys.map((key) => (
                  <Card key={key} className="border">
                    <CardContent className="pt-4 pb-3 px-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {METRIC_LABELS[key] ?? key}
                      </p>
                      <div className="space-y-1.5">
                        {activeCoaches.map((coach, idx) => {
                          const score = Math.round(
                            coach.normalised[key] ?? 0
                          );
                          return (
                            <div
                              key={coach.id}
                              className="flex items-center gap-2"
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    COMPARISON_COLOURS[idx] ??
                                    COMPARISON_COLOURS[2],
                                }}
                              />
                              <span className="flex-1 truncate text-sm">
                                {coach.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${score}%`,
                                      backgroundColor:
                                        COMPARISON_COLOURS[idx] ??
                                        COMPARISON_COLOURS[2],
                                    }}
                                  />
                                </div>
                                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                                  {score}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no other coaches */}
          {otherCoaches.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No other coaches with performance data to compare against.
            </p>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
