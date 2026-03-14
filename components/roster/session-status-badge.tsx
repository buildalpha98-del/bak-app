"use client";

import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/types/enums";

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-secondary text-foreground border-border",
  },
  published: {
    label: "Published",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  pending_confirmation: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  needs_replacement: {
    label: "Needs Replacement",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

/** Status dot colours for compact display (e.g. on session cards) */
export const STATUS_DOT_COLOURS: Record<SessionStatus, string> = {
  draft: "#9CA3AF",
  published: "#3B82F6",
  pending_confirmation: "#F59E0B",
  confirmed: "#22C55E",
  in_progress: "#F97316",
  completed: "#10B981",
  cancelled: "#EF4444",
  needs_replacement: "#DC2626",
};

interface SessionStatusBadgeProps {
  status: SessionStatus;
  className?: string;
}

export function SessionStatusBadge({
  status,
  className,
}: SessionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${className ?? ""}`}
    >
      {config.label}
    </Badge>
  );
}
