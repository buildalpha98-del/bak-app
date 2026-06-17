"use client";

import { useEffect, useState } from "react";
import {
  Footprints,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import {
  getSessionStatusBroadcasts,
  type SessionStatusBroadcast,
  type SessionStatusBroadcastType,
} from "@/lib/sessions/status-broadcast-actions";
import { cn } from "@/lib/utils";

interface SessionStatusTimelineProps {
  sessionId: string;
  /** Pre-fetched broadcasts when the parent already has them; skips the fetch. */
  initial?: SessionStatusBroadcast[];
}

const ICON: Record<SessionStatusBroadcastType, React.ReactNode> = {
  running_late: <Footprints className="size-3.5" />,
  on_site: <MapPin className="size-3.5" />,
  session_over: <CheckCircle2 className="size-3.5" />,
};

const COLOR: Record<SessionStatusBroadcastType, string> = {
  running_late: "border-red-300 bg-red-50 text-red-700",
  on_site: "border-amber-300 bg-amber-50 text-amber-800",
  session_over: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

const LABEL: Record<SessionStatusBroadcastType, string> = {
  running_late: "Running late",
  on_site: "On site",
  session_over: "Session over",
};

export function SessionStatusTimeline({
  sessionId,
  initial,
}: SessionStatusTimelineProps) {
  const [broadcasts, setBroadcasts] = useState<SessionStatusBroadcast[]>(
    initial ?? [],
  );
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void getSessionStatusBroadcasts(sessionId).then((res) => {
      if (cancelled) return;
      setBroadcasts(res.data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, initial]);

  if (loading) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Loading status updates…
      </p>
    );
  }

  if (broadcasts.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        No status updates yet.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {broadcasts.map((b) => (
        <li
          key={b.id}
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
            COLOR[b.status],
          )}
        >
          <span className="mt-0.5">{ICON[b.status]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-medium">{LABEL[b.status]}</span>
              {b.status === "running_late" && b.late_minutes && (
                <span className="text-[11px] font-medium">
                  · {b.late_minutes} min
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                · {b.coach_name ?? "Coach"} · {formatTimeAgo(b.created_at)}
              </span>
            </div>
            {b.message && (
              <p className="mt-1 italic text-foreground/80">"{b.message}"</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
