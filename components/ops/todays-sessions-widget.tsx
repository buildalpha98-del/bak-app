"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { TodaySession, TodaySessionStats } from "@/lib/ops/actions";
import type { SessionStatus } from "@/lib/types/enums";

// ============================================================
// Today's Sessions — full-width command centre widget
// ============================================================

function formatTime12hr(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

function StatusIndicator({ status, hasCoach }: { status: SessionStatus; hasCoach: boolean }) {
  if (!hasCoach) {
    return <span className="inline-block size-2.5 shrink-0 rounded-full bg-red-500" />;
  }

  switch (status) {
    case "confirmed":
      return <span className="inline-block size-2.5 shrink-0 rounded-full bg-green-500" />;
    case "pending_confirmation":
    case "published":
      return <span className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-amber-500" />;
    case "cancelled":
      return <span className="inline-block size-2.5 shrink-0 rounded-full bg-red-500" />;
    case "in_progress":
      return <span className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-blue-500" />;
    case "completed":
      return <span className="shrink-0 text-sm text-gray-500">&#10003;</span>;
    default:
      return <span className="inline-block size-2.5 shrink-0 rounded-full bg-gray-400" />;
  }
}

interface TodaysSessionsWidgetProps {
  sessions: TodaySession[];
  stats: TodaySessionStats;
}

export function TodaysSessionsWidget({ sessions, stats }: TodaysSessionsWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today&apos;s Sessions</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Quick stats bar */}
        <p className="mb-4 text-sm text-[#666666]">
          <span className="font-medium text-[#1A1A1A]">{stats.total} sessions today</span>
          {" — "}
          <span className="text-green-600">{stats.confirmed} confirmed</span>
          {", "}
          <span className="text-amber-600">{stats.pending} pending</span>
          {", "}
          <span className="text-gray-500">{stats.completed} completed</span>
        </p>

        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#666666]">
            No sessions scheduled today
          </p>
        ) : (
          <div className="divide-y">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href="/ops/roster"
                className="flex items-center gap-3 py-2.5 transition-colors hover:bg-gray-50 rounded-md px-2 -mx-2"
              >
                {/* Status dot */}
                <StatusIndicator status={session.status} hasCoach={!!session.coach_id} />

                {/* Time */}
                <span className="w-20 shrink-0 text-sm font-medium text-[#1A1A1A]">
                  {formatTime12hr(session.time)}
                </span>

                {/* Centre name */}
                <span className="min-w-0 flex-1 truncate text-sm text-[#1A1A1A]">
                  {session.centre_name}
                </span>

                {/* Sport */}
                <span className="hidden shrink-0 text-sm text-[#666666] sm:inline">
                  {session.sport}
                </span>

                {/* Coach */}
                {session.coach_name ? (
                  <span className="w-28 shrink-0 truncate text-right text-sm text-[#666666]">
                    {session.coach_name}
                  </span>
                ) : (
                  <span className="w-28 shrink-0 truncate text-right text-sm font-medium text-red-500">
                    Unassigned
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
