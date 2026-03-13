"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import { sendShiftReminder } from "@/lib/sessions/shift-actions";
import type { UnconfirmedShiftItem } from "@/lib/ops/actions";

// ============================================================
// Unconfirmed Shifts widget for command centre
// ============================================================

function formatTime12hr(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

interface UnconfirmedShiftsWidgetProps {
  shifts: UnconfirmedShiftItem[];
  onRefresh: () => void;
}

export function UnconfirmedShiftsWidget({ shifts, onRefresh }: UnconfirmedShiftsWidgetProps) {
  const router = useRouter();
  const [remindingIds, setRemindingIds] = useState<Set<string>>(new Set());

  async function handleRemind(sessionId: string) {
    setRemindingIds((prev) => new Set(prev).add(sessionId));
    try {
      const result = await sendShiftReminder(sessionId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Reminder sent successfully");
        onRefresh();
      }
    } catch {
      toast.error("Failed to send reminder");
    } finally {
      setRemindingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }

  return (
    <WidgetWrapper title="Unconfirmed Shifts" icon={AlertTriangle} count={shifts.length}>
      {shifts.length === 0 ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <CheckCircle2 className="size-5 text-green-500" />
          <span className="text-sm text-[#666666]">All shifts confirmed</span>
        </div>
      ) : (
        <div className="divide-y">
          {shifts.map((shift) => (
            <div key={shift.session_id} className="py-3 space-y-1.5">
              {/* Date, time, centre, sport */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {new Date(shift.date).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    at {formatTime12hr(shift.time)}
                  </p>
                  <p className="text-sm text-[#666666]">
                    {shift.centre_name} &middot; {shift.sport}
                  </p>
                  <p className="text-sm text-[#666666]">{shift.coach_name}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-amber-600">
                  Pending for {shift.hours_pending}h
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={remindingIds.has(shift.session_id)}
                  onClick={() => handleRemind(shift.session_id)}
                >
                  {remindingIds.has(shift.session_id) ? "Sending..." : "Remind"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/ops/roster")}
                >
                  Reassign
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetWrapper>
  );
}
