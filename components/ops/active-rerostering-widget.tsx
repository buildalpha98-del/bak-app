"use client";

import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Send,
  Timer,
} from "lucide-react";
import { formatTime12 } from "@/lib/utils/roster";

// ============================================================
// Types
// ============================================================

export interface ActiveRerosteringEvent {
  id: string;
  session_id: string;
  original_coach_id: string;
  cancellation_reason: string;
  offer_status: string;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  escalated: boolean;
  created_at: string;
  session?: {
    id: string;
    date: string;
    time: string;
    sport: string;
    duration_minutes: number;
    centre_id: string;
    centres?: { name: string } | null;
  } | null;
  original_coach?: {
    id: string;
    name: string;
    phone?: string | null;
  } | null;
  selected_replacement?: {
    id: string;
    name: string;
  } | null;
}

interface ActiveRerosteringWidgetProps {
  events: ActiveRerosteringEvent[];
}

// ============================================================
// Helpers
// ============================================================

function hoursUntil(date: string, time: string): number {
  const dt = new Date(`${date}T${time}`);
  return Math.max(0, (dt.getTime() - Date.now()) / (1000 * 60 * 60));
}

function formatHoursUntil(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

const OFFER_STATUS_LABELS: Record<string, string> = {
  pending_offer: "Awaiting selection",
  offer_sent: "Offer sent",
  declined: "Declined",
  expired: "Offer expired",
};

// ============================================================
// Component
// ============================================================

export function ActiveRerosteringWidget({
  events,
}: ActiveRerosteringWidgetProps) {
  if (events.length === 0) {
    return (
      <WidgetWrapper
        title="Active Rerostering"
        icon={AlertTriangle}
        count={0}
      >
        <p className="text-sm text-muted-foreground">
          No active rerostering events.
        </p>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetWrapper
      title="Active Rerostering"
      icon={AlertTriangle}
      count={events.length}
    >
      <div className="space-y-3">
        {events.map((event) => {
          const session = event.session;
          if (!session) return null;

          const hours = hoursUntil(session.date, session.time);
          const isUrgent = hours <= 4;
          const centreName =
            (session.centres as any)?.name ?? "Unknown Centre";

          return (
            <div
              key={event.id}
              className={`rounded-lg border p-3 space-y-2 ${
                isUrgent
                  ? "border-red-200 bg-red-50/50"
                  : "border-border"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {session.sport}
                    </span>
                    {event.escalated && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5"
                      >
                        Escalated
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {centreName}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Clock
                    className={`size-3.5 ${
                      isUrgent
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      isUrgent ? "text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {formatHoursUntil(hours)}
                  </span>
                </div>
              </div>

              {/* Time + status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {new Date(session.date + "T00:00:00").toLocaleDateString(
                    "en-AU",
                    { weekday: "short", day: "numeric", month: "short" }
                  )}{" "}
                  {formatTime12(session.time.slice(0, 5))}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    event.offer_status === "offer_sent"
                      ? "border-blue-200 text-blue-700"
                      : event.offer_status === "pending_offer"
                        ? "border-amber-200 text-amber-700"
                        : "border-red-200 text-red-700"
                  }`}
                >
                  {event.offer_status === "offer_sent" && (
                    <Send className="mr-1 size-2.5" />
                  )}
                  {OFFER_STATUS_LABELS[event.offer_status] ??
                    event.offer_status}
                </Badge>
              </div>

              {/* Offer expiry countdown */}
              {event.offer_status === "offer_sent" &&
                event.offer_expires_at && (
                  <div className="flex items-center gap-1 text-[10px] text-blue-600">
                    <Timer className="size-3" />
                    <span>
                      Expires{" "}
                      {new Date(event.offer_expires_at).toLocaleTimeString(
                        "en-AU",
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                    </span>
                    {event.selected_replacement && (
                      <span className="ml-1">
                        ({event.selected_replacement.name})
                      </span>
                    )}
                  </div>
                )}

              {/* Quick link */}
              <Link
                href={`/ops/roster?session=${session.id}`}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                View session details
              </Link>
            </div>
          );
        })}
      </div>
    </WidgetWrapper>
  );
}
