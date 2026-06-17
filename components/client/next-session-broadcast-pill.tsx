"use client";

import { useEffect, useState } from "react";
import { Footprints, MapPin, CheckCircle2 } from "lucide-react";
import {
  getRecentBroadcastForSession,
  type SessionStatusBroadcast,
  type SessionStatusBroadcastType,
} from "@/lib/sessions/status-broadcast-actions";
import { cn } from "@/lib/utils";

const ICON: Record<SessionStatusBroadcastType, React.ReactNode> = {
  running_late: <Footprints className="size-3.5" />,
  on_site: <MapPin className="size-3.5" />,
  session_over: <CheckCircle2 className="size-3.5" />,
};

const TONE: Record<SessionStatusBroadcastType, string> = {
  running_late: "border-red-300 bg-red-50 text-red-700",
  on_site: "border-amber-300 bg-amber-50 text-amber-800",
  session_over: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

/**
 * Renders a quiet status pill on the "Next session" hero when a coach
 * has broadcast a status update in the last 60 minutes. Falls back to
 * rendering nothing so the dashboard stays calm on a normal day.
 */
export function NextSessionBroadcastPill({ sessionId }: { sessionId: string }) {
  const [broadcast, setBroadcast] = useState<SessionStatusBroadcast | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void getRecentBroadcastForSession(sessionId, 60).then((res) => {
      if (cancelled) return;
      setBroadcast(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!broadcast) return null;

  const label =
    broadcast.status === "running_late"
      ? `Coach running ${broadcast.late_minutes ?? "a few"} min late`
      : broadcast.status === "on_site"
        ? "Coach on site"
        : "Session over";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE[broadcast.status],
      )}
    >
      {ICON[broadcast.status]}
      <span>{label}</span>
    </div>
  );
}
