"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Bell,
  Loader2,
  Check,
} from "lucide-react";
import { sendShiftReminder } from "@/lib/sessions/shift-actions";
import type { UnconfirmedShift } from "@/lib/sessions/shift-actions";
import { formatTime12, formatDateShort } from "@/lib/utils/roster";

// ============================================================
// Props
// ============================================================

interface UnconfirmedShiftsBannerProps {
  shifts: UnconfirmedShift[];
}

// ============================================================
// Component
// ============================================================

export function UnconfirmedShiftsBanner({
  shifts,
}: UnconfirmedShiftsBannerProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  if (shifts.length === 0) return null;

  function handleSendReminder(sessionId: string) {
    setSendingId(sessionId);
    startTransition(async () => {
      const result = await sendShiftReminder(sessionId);
      if (!result.error) {
        setSentIds((prev) => new Set(prev).add(sessionId));
      }
      setSendingId(null);
      router.refresh();
    });
  }

  function handleSendAll() {
    setSendingAll(true);
    startTransition(async () => {
      const unsent = shifts.filter((s) => !sentIds.has(s.session_id));
      for (const shift of unsent) {
        const result = await sendShiftReminder(shift.session_id);
        if (!result.error) {
          setSentIds((prev) => new Set(prev).add(shift.session_id));
        }
      }
      setSendingAll(false);
      router.refresh();
    });
  }

  const unsentCount = shifts.filter(
    (s) => !sentIds.has(s.session_id)
  ).length;

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {shifts.length} shift{shifts.length !== 1 ? "s" : ""}{" "}
              unconfirmed for 24+ hours
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          {expanded ? "Hide" : "Show"}
          {expanded ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="space-y-2">
          {shifts.map((shift) => {
            const isSent = sentIds.has(shift.session_id);
            const isSending = sendingId === shift.session_id;

            return (
              <div
                key={shift.session_id}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-card px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {shift.coach_name} — {shift.sport}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shift.centre_name} ·{" "}
                    {formatDateShort(shift.date)} ·{" "}
                    {formatTime12(shift.time)} ·{" "}
                    <span className="text-amber-600 font-medium">
                      {shift.hours_pending}h pending
                    </span>
                  </p>
                </div>

                {isSent ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium shrink-0">
                    <Check className="size-3" />
                    Sent
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSendReminder(shift.session_id)}
                    disabled={isPending}
                    className="shrink-0 min-h-[36px] border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    {isSending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <>
                        <Bell className="mr-1 size-3" />
                        Remind
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}

          {/* Send all button */}
          {unsentCount > 1 && (
            <Button
              size="sm"
              onClick={handleSendAll}
              disabled={isPending}
              className="w-full min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white"
            >
              {sendingAll ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Sending reminders…
                </>
              ) : (
                <>
                  <Bell className="mr-2 size-4" />
                  Send All Reminders ({unsentCount})
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
