"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, UserCircle, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { getCoachAvailabilityForSession } from "@/lib/sessions/scheduling-actions";
import type { CoachAvailabilityResult, AvailabilityStatus } from "@/lib/utils/scheduling";

// ============================================================
// Status indicator config
// ============================================================

const STATUS_INDICATOR: Record<
  AvailabilityStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  available: {
    icon: CheckCircle2,
    className: "text-green-600",
  },
  partial: {
    icon: AlertTriangle,
    className: "text-amber-600",
  },
  unavailable: {
    icon: XCircle,
    className: "text-red-400",
  },
};

// ============================================================
// Props
// ============================================================

interface SmartCoachSelectProps {
  sessionId: string;
  currentCoachId: string | null;
  onSelect: (coachId: string) => void;
}

// ============================================================
// Component
// ============================================================

export function SmartCoachSelect({
  sessionId,
  currentCoachId,
  onSelect,
}: SmartCoachSelectProps) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<CoachAvailabilityResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await getCoachAvailabilityForSession(
        sessionId
      );
      if (cancelled) return;
      if (err) {
        setError(err);
      } else {
        setResults(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading availability...
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-2 text-sm text-red-600">{error}</p>
    );
  }

  return (
    <div className="max-h-[300px] space-y-1 overflow-y-auto">
      {results.map((coach) => {
        const indicator = STATUS_INDICATOR[coach.status];
        const Icon = indicator.icon;
        const isCurrent = coach.coachId === currentCoachId;
        const isUnavailable = coach.status === "unavailable";

        return (
          <button
            key={coach.coachId}
            type="button"
            disabled={isUnavailable}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              isUnavailable
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-muted/50"
            } ${isCurrent ? "bg-muted/50 ring-1 ring-primary/30" : ""}`}
            onClick={() => !isUnavailable && onSelect(coach.coachId)}
          >
            <Icon className={`size-4 shrink-0 ${indicator.className}`} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <UserCircle className="size-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {coach.coachName}
                </span>
                {isCurrent && (
                  <span className="text-[10px] text-muted-foreground">
                    (current)
                  </span>
                )}
              </div>
              <p
                className={`text-xs ${
                  coach.status === "available"
                    ? "text-green-600"
                    : coach.status === "partial"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}
              >
                {coach.reason}
              </p>
            </div>
          </button>
        );
      })}

      {results.length === 0 && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          No coaches found.
        </p>
      )}
    </div>
  );
}
