"use client";

import Link from "@/components/ui/app-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Users,
  AlertTriangle,
  ArrowLeft,
  Star,
} from "lucide-react";
import { formatTime12 } from "@/lib/utils/roster";
import { sportColour } from "@/lib/utils/sport-colours";
import { SessionAttendanceList } from "@/components/attendance/session-attendance-list";
import type { ActiveSessionData } from "@/lib/sessions/session-workflow-actions";

interface CompletedSessionSummaryProps {
  data: ActiveSessionData;
}

export function CompletedSessionSummary({
  data,
}: CompletedSessionSummaryProps) {
  const { session, centre_name } = data;
  const colour = sportColour(session.sport);

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 pt-4">
        <CheckCircle2 className="size-6 text-green-600" />
        <h1 className="text-lg font-semibold text-foreground">
          Session Completed
        </h1>
      </div>

      {/* Session info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Session Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: colour }}
            />
            <span className="text-sm font-medium text-foreground">
              {session.sport}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4 shrink-0" />
              <span>{formatTime12(session.time.slice(0, 5))}</span>
            </div>
            <div className="text-sm text-muted-foreground">{centre_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            {session.actual_duration_minutes != null && (
              <div>
                <p className="text-xs text-muted-foreground">Actual Duration</p>
                <p className="text-sm font-medium text-foreground">
                  {session.actual_duration_minutes} min
                </p>
              </div>
            )}
            {session.headcount != null && (
              <div>
                <p className="text-xs text-muted-foreground">Headcount</p>
                <div className="flex items-center gap-1">
                  <Users className="size-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    {session.headcount}
                  </p>
                </div>
              </div>
            )}
          </div>

          {session.needs_ops_review && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="size-4 shrink-0" />
              <span>Flagged for ops review — duration exceeded rostered time.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance */}
      <SessionAttendanceList
        sessionId={session.id}
        headcount={session.headcount}
      />

      {/* Back button */}
      <Button
        variant="outline"
        className="w-full min-h-[44px]"
        nativeButton={false}
        render={<Link href="/coach/schedule" />}
      >
        <ArrowLeft className="size-4" />
        Back to Schedule
      </Button>
    </div>
  );
}
