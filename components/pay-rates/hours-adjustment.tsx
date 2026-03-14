"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Clock,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import {
  requestHoursAdjustment,
  getCoachCompletedSessions,
} from "@/lib/pay-rates/actions";
import { formatTime12 } from "@/lib/utils/roster";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

interface CompletedSession {
  id: string;
  date: string;
  time: string;
  sport: string;
  centre_name: string;
  duration_minutes: number;
  actual_duration_minutes: number | null;
  needs_ops_review: boolean;
  pay_rate_resolved: number | null;
}

interface HoursAdjustmentProps {
  initialSessions: CompletedSession[];
}

// ============================================================
// Component — Coach hours adjustment request view
// ============================================================

export function HoursAdjustment({ initialSessions }: HoursAdjustmentProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedSession, setSelectedSession] =
    useState<CompletedSession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestedDuration, setRequestedDuration] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function openDialog(session: CompletedSession) {
    setSelectedSession(session);
    setRequestedDuration(
      (session.actual_duration_minutes ?? session.duration_minutes).toString()
    );
    setReason("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!selectedSession) return;
    const duration = parseInt(requestedDuration, 10);
    if (!duration || duration <= 0) {
      toast.error("Please enter a valid duration.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }

    startTransition(async () => {
      const res = await requestHoursAdjustment({
        sessionId: selectedSession.id,
        requestedDuration: duration,
        reason: reason.trim(),
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Adjustment request submitted for ops review.");
        setDialogOpen(false);

        // Refresh sessions
        const { data } = await getCoachCompletedSessions();
        if (data) setSessions(data);
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center pt-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground/30" />
        <h3 className="mt-3 text-sm font-medium text-foreground">
          No completed sessions
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Completed sessions will appear here for hours tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          Session Hours
        </h2>
        <p className="text-xs text-muted-foreground">
          Recent completed sessions. Request an adjustment if hours need
          correction.
        </p>
      </div>

      {sessions.map((session) => {
        const actual =
          session.actual_duration_minutes ?? session.duration_minutes;
        const diffMin = actual - session.duration_minutes;

        return (
          <Card key={session.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {session.sport}
                    </p>
                    {session.needs_ops_review && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                      >
                        <AlertTriangle className="size-2.5 mr-0.5" />
                        Under review
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {session.centre_name} ·{" "}
                    {new Date(session.date).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {formatTime12(session.time)}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Rostered: {session.duration_minutes} min
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        diffMin > 0
                          ? "text-amber-600"
                          : diffMin < 0
                            ? "text-red-600"
                            : "text-green-600"
                      }`}
                    >
                      Actual: {actual} min
                      {diffMin !== 0 && (
                        <span>
                          {" "}
                          ({diffMin > 0 ? "+" : ""}
                          {diffMin})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 min-h-[44px]"
                  onClick={() => openDialog(session)}
                >
                  Adjust
                  <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Adjustment Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Hours Adjustment</DialogTitle>
          </DialogHeader>

          {selectedSession && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-sm font-medium text-foreground">
                  {selectedSession.sport} — {selectedSession.centre_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedSession.date).toLocaleDateString(
                    "en-AU",
                    {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    }
                  )}{" "}
                  at {formatTime12(selectedSession.time)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Rostered: {selectedSession.duration_minutes} min · Recorded:{" "}
                  {selectedSession.actual_duration_minutes ??
                    selectedSession.duration_minutes}{" "}
                  min
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="adj-duration" className="text-xs">
                  Actual Duration (minutes)
                </Label>
                <Input
                  id="adj-duration"
                  type="number"
                  min="1"
                  step="15"
                  value={requestedDuration}
                  onChange={(e) => setRequestedDuration(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="adj-reason" className="text-xs">
                  Reason
                </Label>
                <Textarea
                  id="adj-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Session ran 15 min over due to late start..."
                  rows={3}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {isPending && (
                <Loader2 className="size-3 animate-spin mr-1" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
