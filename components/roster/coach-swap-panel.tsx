"use client";

import { useState } from "react";
import { Loader2, UserMinus, ArrowRight, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { recordAdjustment } from "@/lib/scheduling/actions";
import type { SchedulingAssignment } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface CoachSwapPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  assignment: SchedulingAssignment;
  sessionLabel: string; // e.g. "Soccer at Bankstown Centre"
  onSwapped: () => void;
}

const CONFIDENCE_COLOURS = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

// ============================================================
// Component
// ============================================================

export function CoachSwapPanel({
  open,
  onOpenChange,
  runId,
  assignment,
  sessionLabel,
  onSwapped,
}: CoachSwapPanelProps) {
  const [swapping, setSwapping] = useState<string | null>(null);

  async function handleSwap(coachId: string) {
    setSwapping(coachId);
    try {
      await recordAdjustment(
        runId,
        assignment.session_id,
        assignment.assigned_coach_id,
        assignment.score,
        coachId
      );
      onSwapped();
      onOpenChange(false);
    } finally {
      setSwapping(null);
    }
  }

  async function handleUnassign() {
    setSwapping("__unassign__");
    try {
      // Pass empty string to indicate removal
      await recordAdjustment(
        runId,
        assignment.session_id,
        assignment.assigned_coach_id,
        assignment.score,
        ""
      );
      onSwapped();
      onOpenChange(false);
    } finally {
      setSwapping(null);
    }
  }

  const currentCoach = assignment.eligible_coaches.find(
    (c) => c.coach_id === assignment.assigned_coach_id
  );

  const otherCoaches = assignment.eligible_coaches.filter(
    (c) => c.coach_id !== assignment.assigned_coach_id
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Swap Coach</SheetTitle>
          <SheetDescription>{sessionLabel}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          {/* Current assignment */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current Assignment
            </p>
            {currentCoach ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <Circle
                    className="size-2.5"
                    fill={CONFIDENCE_COLOURS[assignment.confidence]}
                    stroke={CONFIDENCE_COLOURS[assignment.confidence]}
                    strokeWidth={0}
                  />
                  <span className="text-sm font-medium">{currentCoach.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Score: {currentCoach.score}
                </span>
              </div>
            ) : assignment.assigned_coach_id ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
                <span className="text-sm font-medium">Assigned coach</span>
                <span className="text-xs text-muted-foreground">
                  Score: {assignment.score}
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground italic">
                Unassigned
              </div>
            )}

            {/* Reasoning */}
            {assignment.reasoning.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Reasoning</p>
                <ul className="space-y-0.5">
                  {assignment.reasoning.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Eligible coaches */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Eligible Coaches ({otherCoaches.length})
            </p>

            {otherCoaches.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No other eligible coaches available
              </p>
            ) : (
              <div className="space-y-1.5">
                {otherCoaches
                  .sort((a, b) => b.score - a.score)
                  .map((coach) => (
                    <button
                      key={coach.coach_id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                      onClick={() => handleSwap(coach.coach_id)}
                      disabled={swapping !== null}
                    >
                      <div>
                        <p className="text-sm font-medium">{coach.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Score: {coach.score}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {swapping === coach.coach_id ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <ArrowRight className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Leave unassigned */}
          {assignment.assigned_coach_id && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-600 hover:text-red-700"
              onClick={handleUnassign}
              disabled={swapping !== null}
            >
              {swapping === "__unassign__" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserMinus className="size-4" />
              )}
              Leave Unassigned
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
