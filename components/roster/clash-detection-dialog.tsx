"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Clock,
  Car,
  ShieldAlert,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { checkWeekClashes, acknowledgeClash } from "@/lib/sessions/scheduling-actions";
import { formatTime12 } from "@/lib/utils/roster";
import type { ClashResult, ClashType } from "@/lib/utils/scheduling";

// ============================================================
// Clash type config
// ============================================================

const CLASH_CONFIG: Record<
  ClashType,
  { icon: typeof AlertTriangle; label: string; colour: string }
> = {
  time_overlap: {
    icon: Clock,
    label: "Time Overlap",
    colour: "bg-red-100 text-red-700 border-red-200",
  },
  travel_buffer: {
    icon: Car,
    label: "Travel Buffer",
    colour: "bg-amber-100 text-amber-700 border-amber-200",
  },
  compliance: {
    icon: ShieldAlert,
    label: "Compliance",
    colour: "bg-orange-100 text-orange-700 border-orange-200",
  },
};

// ============================================================
// Props
// ============================================================

interface ClashDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStartDate: string;
}

// ============================================================
// Component
// ============================================================

export function ClashDetectionDialog({
  open,
  onOpenChange,
  weekStartDate,
}: ClashDetectionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [clashes, setClashes] = useState<ClashResult[] | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<number>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);

  async function runDetection() {
    setLoading(true);
    setError(null);
    setAcknowledgedIds(new Set());

    const { data, error: err } = await checkWeekClashes(weekStartDate);

    if (err) {
      setError(err);
    } else {
      setClashes(data);
    }
    setLoading(false);
  }

  async function handleAcknowledge(clash: ClashResult, index: number) {
    const sessionIds = [clash.sessionA.id];
    if (clash.sessionB) sessionIds.push(clash.sessionB.id);

    await acknowledgeClash(clash.description, sessionIds);

    setAcknowledgedIds((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }

  // Reset state when dialog opens
  function handleOpenChange(isOpen: boolean) {
    if (isOpen && clashes === null) {
      runDetection();
    }
    onOpenChange(isOpen);
  }

  const unacknowledgedCount =
    clashes?.filter((_, i) => !acknowledgedIds.has(i)).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" />
            Clash Detection
          </DialogTitle>
          <DialogDescription>
            Checking sessions for time overlaps, travel buffer issues, and
            compliance gaps.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Scanning sessions...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={runDetection}
            >
              Retry
            </Button>
          </div>
        )}

        {clashes !== null && !loading && (
          <div className="space-y-4">
            {/* Summary */}
            {clashes.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="size-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700">
                    No clashes found
                  </p>
                  <p className="text-xs text-green-600">
                    All sessions for this week look good.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Found {clashes.length} issue
                    {clashes.length !== 1 ? "s" : ""}.{" "}
                    {unacknowledgedCount > 0 && (
                      <span className="font-medium text-amber-600">
                        {unacknowledgedCount} pending acknowledgement.
                      </span>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runDetection}
                  >
                    Re-check
                  </Button>
                </div>

                <Separator />

                {/* Clash cards */}
                <div className="space-y-3">
                  {clashes.map((clash, i) => {
                    const config = CLASH_CONFIG[clash.type];
                    const Icon = config.icon;
                    const isAcknowledged = acknowledgedIds.has(i);

                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 transition-opacity ${
                          isAcknowledged ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <Badge
                              variant="outline"
                              className={`flex items-center gap-1 ${config.colour}`}
                            >
                              <Icon className="size-3" />
                              {config.label}
                            </Badge>
                          </div>
                          {!isAcknowledged && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAcknowledge(clash, i)}
                            >
                              Acknowledge
                            </Button>
                          )}
                          {isAcknowledged && (
                            <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                              <CheckCircle2 className="mr-1 size-3" />
                              Acknowledged
                            </Badge>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-foreground">
                          {clash.description}
                        </p>

                        {/* Session details */}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            {clash.sessionA.centre_name} ·{" "}
                            {formatTime12(
                              clash.sessionA.time.slice(0, 5)
                            )}
                          </span>
                          {clash.sessionB && (
                            <span className="rounded bg-muted px-1.5 py-0.5">
                              {clash.sessionB.centre_name} ·{" "}
                              {formatTime12(
                                clash.sessionB.time.slice(0, 5)
                              )}
                            </span>
                          )}
                        </div>

                        {/* Travel detail */}
                        {clash.travelDetail && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Estimated travel: {clash.travelDetail.estimatedMinutes}min
                            · Gap: {clash.travelDetail.gapMinutes}min
                          </p>
                        )}

                        {/* Suggestion */}
                        <div className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
                          <strong>Suggestion:</strong> {clash.suggestion}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
