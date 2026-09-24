"use client";

// "Needs your decision": the coach- and centre-originated asks that had
// no staff screen — hours adjustments (approve/reject actions existed
// with no caller), sessions the app flagged for review, and centres'
// change requests (visible only inside one session's sheet). Each row
// carries its own action so nothing needs opening.

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Gavel, Timer, X } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import { approveHoursAdjustment, rejectHoursAdjustment } from "@/lib/pay-rates/actions";
import { resolveChangeRequest } from "@/lib/sessions/change-request-actions";
import { resolveSessionReview, settleAutoClosedSessions } from "@/lib/ops/decision-actions";
import type { ChangeRequestItem, DecisionQueue, HoursAdjustmentItem, ReviewItem } from "@/lib/ops/decision-queue";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

function day(iso: string) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: SYDNEY_TZ });
}
function hhmm(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export function DecisionQueueWidget({ queue, onRefresh, basePath }: { queue: DecisionQueue; onRefresh: () => void; basePath: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function run(key: string, fn: () => Promise<{ error: string | null }>, done: string) {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(done);
        setRejecting(null);
        setReason("");
        onRefresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const Hours = ({ h }: { h: HoursAdjustmentItem }) => {
    const key = `h:${h.task_id}`;
    const value = minutes[key] ?? String(h.requested_minutes);
    return (
      <li className="space-y-2 py-3">
        <p className="text-sm font-medium text-foreground">
          <Timer className="mr-1 inline size-3.5 text-amber-600" />
          {h.coach_name} asks for {h.requested_minutes} min, rostered {h.rostered_minutes}
        </p>
        <p className="text-sm text-muted-foreground">
          {h.sport} at {h.centre_name} · {day(h.date)}
          {h.reason && <> · &ldquo;{h.reason}&rdquo;</>}
        </p>
        {rejecting === key ? (
          <div className="flex flex-wrap gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the coach" className="h-9 flex-1" aria-label="Rejection reason" />
            <Button size="sm" variant="destructive" disabled={busy === key || !reason.trim()} onClick={() => run(key, () => rejectHoursAdjustment({ taskId: h.task_id, sessionId: h.session_id, reason }), "Adjustment rejected")}>
              Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" min={0} max={720} step={15} value={value} onChange={(e) => setMinutes((m) => ({ ...m, [key]: e.target.value }))} className="h-9 w-24" aria-label={`Approved minutes for ${h.coach_name}`} />
            <span className="text-xs text-muted-foreground">min</span>
            <Button size="sm" disabled={busy === key} onClick={() => run(key, () => approveHoursAdjustment({ taskId: h.task_id, sessionId: h.session_id, approvedDuration: Number(value) }), `Approved ${value} min`)}>
              <Check className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(key)}>
              <X className="size-3.5" /> Reject
            </Button>
          </div>
        )}
      </li>
    );
  };

  const Review = ({ r }: { r: ReviewItem }) => {
    const key = `r:${r.session_id}`;
    const suggested = r.actual_minutes ?? r.rostered_minutes;
    const value = minutes[key] ?? String(suggested);
    return (
      <li className="space-y-2 py-3">
        <p className="text-sm font-medium text-foreground">
          <CalendarClock className="mr-1 inline size-3.5 text-sky-600" />
          {r.cause === "ran_long" ? `Ran ${r.actual_minutes! - r.rostered_minutes} min over` : "Closed automatically — nobody checked out"}
        </p>
        <p className="text-sm text-muted-foreground">
          {r.coach_name ?? "No coach"} · {r.sport} at {r.centre_name} · {day(r.date)} · rostered {r.rostered_minutes} min
          {r.headcount === null && r.cause === "auto_closed" ? " · no headcount" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="number" min={0} max={720} step={15} value={value} onChange={(e) => setMinutes((m) => ({ ...m, [key]: e.target.value }))} className="h-9 w-24" aria-label={`Minutes for ${r.sport} at ${r.centre_name}`} />
          <span className="text-xs text-muted-foreground">min</span>
          <Button size="sm" disabled={busy === key} onClick={() => run(key, () => resolveSessionReview({ sessionId: r.session_id, actualMinutes: Number(value) }), `Settled at ${value} min`)}>
            <Check className="size-3.5" /> Settle
          </Button>
          {r.cause === "ran_long" && (
            <Button size="sm" variant="outline" disabled={busy === key} onClick={() => run(key, () => resolveSessionReview({ sessionId: r.session_id, actualMinutes: r.rostered_minutes }), `Kept at ${r.rostered_minutes} min`)}>
              Keep rostered
            </Button>
          )}
        </div>
      </li>
    );
  };

  const Change = ({ c }: { c: ChangeRequestItem }) => {
    const key = `c:${c.request_id}`;
    return (
      <li className="space-y-2 py-3">
        <p className="text-sm font-medium text-foreground">
          <Gavel className="mr-1 inline size-3.5 text-violet-600" />
          {c.centre_name} asks to {c.request_type === "cancel" ? "cancel" : "move"} {c.sport} on {day(c.date)}
          {c.request_type === "reschedule" && c.requested_date && (
            <>
              {" "}
              → {day(c.requested_date)} {hhmm(c.requested_time)}
            </>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {c.requester_name ?? "The centre"}
          {c.reason && <> · &ldquo;{c.reason}&rdquo;</>} ·{" "}
          <Link href={`${basePath}?week=${c.date}&centre=${c.centre_id}`} className="underline">
            open on the roster
          </Link>
        </p>
        {rejecting === key ? (
          <div className="flex flex-wrap gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Note for the centre (optional)" className="h-9 flex-1" aria-label="Decline note" />
            <Button size="sm" variant="destructive" disabled={busy === key} onClick={() => run(key, () => resolveChangeRequest(c.request_id, "decline", reason || undefined), "Request declined")}>
              Decline
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy === key} onClick={() => run(key, () => resolveChangeRequest(c.request_id, "approve"), c.request_type === "cancel" ? "Session cancelled" : "Session moved")}>
              <Check className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(key)}>
              <X className="size-3.5" /> Decline
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <WidgetWrapper title="Needs your decision" icon={Gavel} count={queue.total}>
      {queue.total === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing waiting on you.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {queue.reviews.filter((r) => r.cause === "auto_closed").length > 1 && (
            <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="text-muted-foreground">
                {queue.reviews.filter((r) => r.cause === "auto_closed").length} sessions were closed automatically with nothing recorded.
              </span>
              <Button size="sm" variant="outline" disabled={busy === "auto"} onClick={() => run("auto", async () => (await settleAutoClosedSessions()).error ? { error: "Failed to settle." } : { error: null }, "Settled at rostered length")}>
                Settle all at rostered
              </Button>
            </li>
          )}
          {queue.hours.map((h) => (
            <Hours key={h.task_id} h={h} />
          ))}
          {queue.changes.map((c) => (
            <Change key={c.request_id} c={c} />
          ))}
          {queue.reviews.map((r) => (
            <Review key={r.session_id} r={r} />
          ))}
        </ul>
      )}
    </WidgetWrapper>
  );
}
