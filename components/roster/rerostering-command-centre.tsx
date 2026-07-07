"use client";

// ============================================================
// Rerostering command centre
// ============================================================
//
// One screen for every session that still needs a coach: who
// cancelled and why, which candidate holds the live offer and how
// long until it lapses, and the ranked next-best candidates with a
// one-tap "Send offer". The 15-min escalation cron flips lapsed
// offers to "expired" — they stay on this list until the session is
// covered, so nothing drifts into limbo.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  CalendarX2,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MapPin,
  Phone,
  Send,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sendReplacementOffer } from "@/lib/rerostering/actions";
import type { RerosteringSuggestion } from "@/lib/types/database";

interface EventSession {
  id: string;
  date: string;
  time: string;
  sport: string;
  duration_minutes: number;
  status?: string;
  centres: { name: string } | { name: string }[] | null;
}

interface EventCoach {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface CommandCentreEvent {
  id: string;
  session_id: string;
  original_coach_id: string;
  cancellation_reason: string | null;
  suggestions_json: RerosteringSuggestion[] | null;
  selected_replacement_id: string | null;
  offer_status: string;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  escalated: boolean;
  created_at: string;
  session?: EventSession;
  original_coach?: EventCoach;
  selected_replacement?: EventCoach | null;
}

interface Props {
  events: CommandCentreEvent[];
}

const OFFER_STATUS_CHIP: Record<string, { label: string; className: string }> = {
  pending_offer: { label: "No offer sent", className: "bg-amber-100 text-amber-800" },
  offer_sent: { label: "Offer live", className: "bg-blue-100 text-blue-800" },
  expired: { label: "Offer expired", className: "bg-red-100 text-red-700" },
  declined: { label: "Offer declined", className: "bg-red-100 text-red-700" },
};

function centreName(session?: EventSession): string {
  if (!session?.centres) return "Unknown centre";
  const c = session.centres;
  return Array.isArray(c) ? c[0]?.name ?? "Unknown centre" : c.name;
}

function fmtSessionWhen(session?: EventSession): string {
  if (!session) return "Unknown session";
  const date = new Date(session.date + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${date} · ${session.time.slice(0, 5)}`;
}

export function RerosteringCommandCentre({ events }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(
    events.length === 1 ? events[0].id : null
  );

  // Tick every 15s so the live-offer countdowns stay honest without
  // hammering re-renders.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(
    () =>
      [...events].sort((a, b) => {
        const aKey = `${a.session?.date ?? "9999"}T${a.session?.time ?? "23:59"}`;
        const bKey = `${b.session?.date ?? "9999"}T${b.session?.time ?? "23:59"}`;
        return aKey.localeCompare(bKey);
      }),
    [events]
  );

  function handleSendOffer(eventId: string, coachId: string, coachLabel: string) {
    setSendingKey(`${eventId}:${coachId}`);
    startTransition(async () => {
      const result = await sendReplacementOffer(eventId, coachId);
      setSendingKey(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Offer sent to ${coachLabel} — 30 minutes to respond.`);
      router.refresh();
    });
  }

  if (sorted.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
          <p className="font-medium text-foreground">All shifts covered</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            No open replacements right now. When a coach cancels, the
            session lands here with ranked replacement candidates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((event) => {
        const chip =
          OFFER_STATUS_CHIP[event.offer_status] ?? OFFER_STATUS_CHIP.pending_offer;
        const expanded = expandedId === event.id;
        const suggestions = event.suggestions_json ?? [];

        // Live-offer countdown
        let countdown: string | null = null;
        let countdownUrgent = false;
        if (event.offer_status === "offer_sent" && event.offer_expires_at) {
          const msLeft = new Date(event.offer_expires_at).getTime() - now;
          if (msLeft > 0) {
            const mins = Math.ceil(msLeft / 60_000);
            countdown = `expires in ${mins} min`;
            countdownUrgent = mins <= 5;
          } else {
            countdown = "lapsed — cron will expire it shortly";
            countdownUrgent = true;
          }
        }

        return (
          <Card key={event.id} className="overflow-hidden rounded-2xl">
            {/* Summary row */}
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : event.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/50"
            >
              <CalendarX2 className="h-5 w-5 shrink-0 text-[#E8712A]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {event.session?.sport ?? "Session"} — {centreName(event.session)}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{fmtSessionWhen(event.session)}</span>
                  <span className="inline-flex items-center gap-1">
                    <UserX className="h-3 w-3" />
                    {event.original_coach?.name ?? "Unknown"}
                    {event.cancellation_reason
                      ? ` · ${event.cancellation_reason.replace(/_/g, " ")}`
                      : ""}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {event.escalated && (
                  <Badge className="bg-red-100 text-red-700">Escalated</Badge>
                )}
                <Badge className={chip.className}>{chip.label}</Badge>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {/* Countdown strip for live offers */}
            {countdown && (
              <div
                className={`flex items-center gap-2 border-t px-4 py-2 text-xs ${
                  countdownUrgent
                    ? "bg-red-50 text-red-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                <AlarmClock className="h-3.5 w-3.5" />
                Offer to {event.selected_replacement?.name ?? "coach"} {countdown}
              </div>
            )}

            {/* Candidate list */}
            {expanded && (
              <div className="border-t">
                {suggestions.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No ranked candidates for this session — assign manually
                    from the roster.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {suggestions.map((s, i) => {
                      const isCurrent =
                        s.coach_id === event.selected_replacement_id;
                      const isLapsed =
                        isCurrent &&
                        (event.offer_status === "expired" ||
                          event.offer_status === "declined");
                      const key = `${event.id}:${s.coach_id}`;
                      const sending = sendingKey === key;
                      const disableSend =
                        isPending ||
                        (isCurrent && event.offer_status === "offer_sent");

                      return (
                        <li
                          key={s.coach_id}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {i + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                              {s.coach_name}
                              <Badge
                                variant="outline"
                                className={
                                  s.availability_status === "confirmed"
                                    ? "border-emerald-300 text-emerald-700"
                                    : "border-amber-300 text-amber-700"
                                }
                              >
                                {s.availability_status === "confirmed"
                                  ? "Available"
                                  : "Maybe"}
                              </Badge>
                              {isCurrent && event.offer_status === "offer_sent" && (
                                <Badge className="bg-blue-100 text-blue-800">
                                  Offer live
                                </Badge>
                              )}
                              {isLapsed && (
                                <Badge className="bg-red-100 text-red-700">
                                  {event.offer_status === "declined"
                                    ? "Declined"
                                    : "Didn't respond"}
                                </Badge>
                              )}
                            </p>
                            <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                              <span>Score {s.score}</span>
                              {s.coach_phone && (
                                <a
                                  href={`tel:${s.coach_phone}`}
                                  className="inline-flex items-center gap-1 hover:text-foreground"
                                >
                                  <Phone className="h-3 w-3" />
                                  {s.coach_phone}
                                </a>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={isLapsed ? "outline" : "default"}
                            className={
                              isLapsed
                                ? ""
                                : "bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
                            }
                            disabled={disableSend}
                            onClick={() =>
                              handleSendOffer(event.id, s.coach_id, s.coach_name)
                            }
                          >
                            {sending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="mr-1.5 h-3.5 w-3.5" />
                                {isCurrent && event.offer_status === "offer_sent"
                                  ? "Sent"
                                  : isLapsed
                                    ? "Re-offer"
                                    : "Send offer"}
                              </>
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="flex items-center gap-1.5 border-t bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  Offers give the coach 30 minutes to accept before this list
                  asks you to try the next candidate.
                </p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
