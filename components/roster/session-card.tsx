"use client";

import type { ReactNode } from "react";
import { ShieldAlert, ShieldOff, StickyNote } from "lucide-react";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";
import { sportColour } from "@/lib/utils/sport-colours";
import { STATUS_DOT_COLOURS } from "./session-status-badge";
import { VarianceBadge } from "./variance-badge";
import { SessionCardMenu } from "./session-card-menu";
import {
  describeSessionCertWarning,
  type SessionCertWarning,
} from "@/lib/utils/compliance/cert-warnings";

interface SessionCardProps {
  session: SessionWithRelations;
  onClick: () => void;
  /**
   * Per-session-date cert state (preferred). Renders a red shield for
   * `blocked` (cert invalid by session date) and an amber shield for
   * `expiring` (cert expires within 14 days of session date).
   */
  certWarning?: SessionCertWarning;
  /** Optional confidence badge overlay (used during AI review mode) */
  confidenceBadge?: ReactNode;
  /** Coach list — required to show the SessionCardMenu */
  coaches?: Pick<Profile, "id" | "name">[];
  /** Called after any menu action mutates the session */
  onChange?: () => void;
}

export function SessionCard({
  session,
  onClick,
  certWarning,
  confidenceBadge,
  coaches,
  onChange,
}: SessionCardProps) {
  const colour = sportColour(session.sport);
  const dotColour = STATUS_DOT_COLOURS[session.status];

  return (
    <div className="relative h-full w-full group">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${session.sport} session at ${session.centre_name}, ${session.duration_minutes} minutes${session.coach_name ? `, ${session.coach_name}` : ", unassigned"}, ${session.status}`}
        className="flex h-full w-full cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-2 py-1 text-left shadow-sm transition-all hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

        {/* Per-session cert warning indicator */}
        {certWarning && certWarning.blocked.length > 0 ? (
          <span
            className="absolute bottom-1 right-1.5 flex items-center gap-0.5 rounded bg-red-100 px-1 py-0.5"
            title={describeSessionCertWarning(certWarning)}
          >
            <ShieldOff className="size-2.5 text-red-600" />
            <span className="text-[9px] font-medium text-red-600">!</span>
          </span>
        ) : certWarning && certWarning.expiring.length > 0 ? (
          <span
            className="absolute bottom-1 right-1.5 flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5"
            title={describeSessionCertWarning(certWarning)}
          >
            <ShieldAlert className="size-2.5 text-amber-600" />
            <span className="text-[9px] font-medium text-amber-600">
              {certWarning.expiring[0].daysUntilExpiry}d
            </span>
          </span>
        ) : null}
      </button>

      {coaches && onChange && (
        <SessionCardMenu
          session={session}
          coaches={coaches}
          onChange={onChange}
        />
      )}

      {session.notes && (
        <span
          className="pointer-events-none absolute bottom-1 left-1 z-10 flex h-4 w-4 items-center justify-center rounded bg-secondary text-secondary-foreground"
          title={session.notes}
          aria-label="Has note"
        >
          <StickyNote className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
