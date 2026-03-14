"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Check, X } from "lucide-react";
import { getSessionAttendance } from "@/lib/attendance/actions";
import type { SessionAttendanceRecord } from "@/lib/attendance/actions";

// ============================================================
// Props
// ============================================================

interface SessionAttendanceListProps {
  sessionId: string;
  headcount?: number | null;
}

// ============================================================
// Component
// ============================================================

export function SessionAttendanceList({
  sessionId,
  headcount,
}: SessionAttendanceListProps) {
  const [records, setRecords] = useState<SessionAttendanceRecord[] | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await getSessionAttendance(sessionId);
      setRecords(data ?? []);
      setLoading(false);
    }
    load();
  }, [sessionId]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            Attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const presentCount = records?.filter((r) => r.present).length ?? 0;
  const hasNamedAttendance = records && records.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            Attendance
          </CardTitle>
          <Badge variant="secondary">
            {hasNamedAttendance
              ? `${presentCount} / ${records.length} present`
              : `${headcount ?? 0} children`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {hasNamedAttendance ? (
          <div className="space-y-1">
            {records.map((r) => (
              <div
                key={r.child_id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  r.present
                    ? "bg-green-50 border border-green-200"
                    : "bg-card border border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex size-5 items-center justify-center rounded-full ${
                      r.present
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.present ? (
                      <Check className="size-3" />
                    ) : (
                      <X className="size-3" />
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      r.present
                        ? "text-green-900 font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {r.first_name} {r.last_name}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {r.age_group}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Headcount only — {headcount ?? 0} children recorded.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
