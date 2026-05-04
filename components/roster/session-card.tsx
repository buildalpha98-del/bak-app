"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import { sportColour } from "@/lib/utils/sport-colours";
import { STATUS_DOT_COLOURS } from "./session-status-badge";
import { VarianceBadge } from "./variance-badge";

interface SessionCardProps {
  session: SessionWithRelations;
  onClick: () => void;
  /** True when the assigned coach has a compliance issue */
  hasComplianceWarning?: boolean;
  /** Optional confidence badge overlay (used during AI review mode) */
  confidenceBadge?: ReactNode;
}

export function SessionCard({
  session,
  onClick,
  hasComplianceWarning,
  confidenceBadge,
}: SessionCardProps) {
  const colour = sportColour(session.sport);
  const dotColour = STATUS_DOT_COLOURS[session.status];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${session.sport} session at ${session.centre_name}, ${session.duration_minutes} minutes${session.coach_name ? `, ${session.coach_name}` : ", unassigned"}, ${session.status}`}
      className="group relative flex h-full w-full cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-2 py-1 text-left shadow-sm transition-all hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ borderLeftWidth: 3, borderLeftColor: colour }}
    >
      {/* Status dot */}
      <span
        className="absolute right-1.5 top-1.5 size-1.5 rounded-full"
        style={{ backgroundColor: dotColour }}
        title={session.status}
      />

      {/* AI confidence badge */}
      {confidenceBadge && (
        <span className="absolute right-5 top-1">
          {confidenceBadge}
        </span>
      )}

      <span className="truncate pr-3 text-xs font-medium text-foreground">
        {session.centre_name}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {session.sport} · {session.duration_minutes}min
      </span>
      <span
        className={`truncate text-[11px] ${
          session.coach_name
            ? "text-muted-foreground"
            : "italic text-muted-foreground"
        }`}
      >
        {session.coach_name ?? "Unassigned"}
      </span>

      {/* Variance badge (bottom-left) */}
      {(session.started_at || session.completed_at) && (
        <span className="absolute bottom-1 left-1.5">
          <VarianceBadge
            date={session.date}
            time={session.time}
            durationMinutes={session.duration_minutes}
            startedAt={session.started_at}
            completedAt={session.completed_at}
            size="xs"
          />
        </span>
      )}

      {/* Compliance warning indicator */}
      {hasComplianceWarning && (
        <span
          className="absolute bottom-1 right-1.5 flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5"
          title="Coach has expired or missing compliance documents"
        >
          <ShieldAlert className="size-2.5 text-amber-600" />
          <span className="text-[9px] font-medium text-amber-600">!</span>
        </span>
      )}
    </button>
  );
}
