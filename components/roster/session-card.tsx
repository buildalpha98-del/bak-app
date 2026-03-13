"use client";

import { ShieldAlert } from "lucide-react";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import { sportColour } from "@/lib/utils/sport-colours";
import { STATUS_DOT_COLOURS } from "./session-status-badge";

interface SessionCardProps {
  session: SessionWithRelations;
  onClick: () => void;
  /** True when the assigned coach has a compliance issue */
  hasComplianceWarning?: boolean;
}

export function SessionCard({
  session,
  onClick,
  hasComplianceWarning,
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
