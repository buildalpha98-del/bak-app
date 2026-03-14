"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Clock,
  Phone,
  Send,
  Loader2,
  UserX,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { sendReplacementOffer } from "@/lib/rerostering/actions";
import type { RerosteringSuggestion, RerosteringEvent } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface ReplacementPanelProps {
  event: {
    id: string;
    session_id: string;
    original_coach_id: string;
    cancellation_reason: string;
    cancellation_details?: string | null;
    suggestions_json: RerosteringSuggestion[];
    selected_replacement_id: string | null;
    offer_status: string;
    offer_sent_at: string | null;
    offer_expires_at: string | null;
    escalated: boolean;
    created_at: string;
  };
  originalCoachName?: string;
  sessionDate: string;
  sessionTime: string;
}

// ============================================================
// Helpers
// ============================================================

function hoursUntilSession(date: string, time: string): number {
  const sessionDt = new Date(`${date}T${time}`);
  return (sessionDt.getTime() - Date.now()) / (1000 * 60 * 60);
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const mins = Math.round(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60)
  );
  if (mins <= 0) return "Expired";
  if (mins < 60) return `${mins}m remaining`;
  return `${Math.round(mins / 60)}h ${mins % 60}m remaining`;
}

const REASON_LABELS: Record<string, string> = {
  sick: "Sick",
  emergency: "Emergency",
  personal: "Personal",
  other: "Other",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending_offer: {
    label: "Awaiting Selection",
    icon: Clock,
    className: "text-amber-700 bg-amber-50 border-amber-200",
  },
  offer_sent: {
    label: "Offer Sent",
    icon: Send,
    className: "text-blue-700 bg-blue-50 border-blue-200",
  },
  declined: {
    label: "Declined",
    icon: XCircle,
    className: "text-red-700 bg-red-50 border-red-200",
  },
  expired: {
    label: "Expired",
    icon: Timer,
    className: "text-gray-700 bg-gray-50 border-gray-200",
  },
  accepted: {
    label: "Accepted",
    icon: CheckCircle2,
    className: "text-green-700 bg-green-50 border-green-200",
  },
};

// ============================================================
// Score breakdown bar
// ============================================================

function ScoreBar({ label, value }: { label: string; value: number }) {
  const maxScore = 30; // Normalise to max dimension score
  const pct = Math.min(100, (value / maxScore) * 100);

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] text-muted-foreground truncate">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-[10px] font-medium text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export function ReplacementPanel({
  event,
  originalCoachName,
  sessionDate,
  sessionTime,
}: ReplacementPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sendingCoachId, setSendingCoachId] = useState<string | null>(null);

  const suggestions = event.suggestions_json ?? [];
  const hours = hoursUntilSession(sessionDate, sessionTime);
  const isUrgent = hours <= 4 && hours > 0;

  const statusInfo = STATUS_CONFIG[event.offer_status] ?? STATUS_CONFIG.pending_offer;
  const StatusIcon = statusInfo.icon;

  function handleSendOffer(coachId: string) {
    setSendingCoachId(coachId);
    startTransition(async () => {
      const result = await sendReplacementOffer(event.id, coachId);
      setSendingCoachId(null);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Replacement offer sent.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Urgent banner */}
      {isUrgent && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertTriangle className="size-4 shrink-0 text-red-600" />
          <p className="text-sm font-medium text-red-700">
            Session starts in {Math.round(hours)} hour
            {Math.round(hours) !== 1 ? "s" : ""} — urgent replacement needed
          </p>
        </div>
      )}

      {/* Cancellation info */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <UserX className="size-4 text-red-600" />
          <span className="text-sm font-medium text-red-700">
            Coach Cancellation
          </span>
        </div>
        <p className="text-sm text-red-600">
          <span className="font-medium">
            {originalCoachName ?? "Coach"}
          </span>{" "}
          cancelled — {REASON_LABELS[event.cancellation_reason] ?? event.cancellation_reason}
        </p>
        {event.cancellation_details && (
          <p className="text-xs text-red-500">{event.cancellation_details}</p>
        )}
        <p className="text-xs text-red-400">
          {new Date(event.created_at).toLocaleString("en-AU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Current status */}
      <div
        className={`flex items-center gap-2 rounded-lg border p-2.5 ${statusInfo.className}`}
      >
        <StatusIcon className="size-4" />
        <span className="text-sm font-medium">{statusInfo.label}</span>
        {event.offer_status === "offer_sent" && event.offer_expires_at && (
          <span className="ml-auto text-xs">
            {formatRelativeTime(event.offer_expires_at)}
          </span>
        )}
      </div>

      <Separator />

      {/* Replacement suggestions */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">
          Replacement Suggestions ({suggestions.length})
        </h4>

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No eligible replacement coaches found.
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions
              .sort((a, b) => b.score - a.score)
              .map((suggestion, i) => {
                const isSelected =
                  event.selected_replacement_id === suggestion.coach_id;
                const canSend =
                  event.offer_status === "pending_offer" ||
                  event.offer_status === "declined" ||
                  event.offer_status === "expired";

                return (
                  <Card
                    key={suggestion.coach_id}
                    className={isSelected ? "border-primary" : ""}
                  >
                    <CardContent className="p-3 space-y-2">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-light)] text-xs font-semibold text-primary">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {suggestion.coach_name}
                            </p>
                            {suggestion.coach_phone && (
                              <a
                                href={`tel:${suggestion.coach_phone}`}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <Phone className="size-3" />
                                {suggestion.coach_phone}
                              </a>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs font-semibold">
                          {suggestion.score}/100
                        </Badge>
                      </div>

                      {/* Score breakdown */}
                      <div className="space-y-1">
                        <ScoreBar
                          label="Familiarity"
                          value={suggestion.score_breakdown.familiarity}
                        />
                        <ScoreBar
                          label="Utilisation"
                          value={suggestion.score_breakdown.utilisation}
                        />
                        <ScoreBar
                          label="Location"
                          value={suggestion.score_breakdown.location}
                        />
                        <ScoreBar
                          label="Preference"
                          value={suggestion.score_breakdown.preference}
                        />
                        <ScoreBar
                          label="Compliance"
                          value={suggestion.score_breakdown.compliance}
                        />
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            suggestion.availability_status === "confirmed"
                              ? "border-green-200 text-green-700"
                              : "border-amber-200 text-amber-700"
                          }`}
                        >
                          {suggestion.availability_status === "confirmed"
                            ? "Available"
                            : "Potentially available"}
                        </Badge>
                        <span>
                          {suggestion.current_week_hours}h this week
                        </span>
                        {suggestion.last_at_centre && (
                          <span>
                            Last here:{" "}
                            {new Date(
                              suggestion.last_at_centre
                            ).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                      </div>

                      {/* Action */}
                      {canSend && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleSendOffer(suggestion.coach_id)}
                          disabled={isPending}
                        >
                          {sendingCoachId === suggestion.coach_id ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          ) : (
                            <Send className="mr-1.5 size-3.5" />
                          )}
                          Send Offer
                        </Button>
                      )}
                      {isSelected &&
                        event.offer_status === "offer_sent" && (
                          <Badge className="w-full justify-center bg-blue-100 text-blue-700">
                            Offer sent — awaiting response
                          </Badge>
                        )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
