"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Footprints, MapPin, CheckCircle2, Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  broadcastSessionStatus,
  getSessionStatusBroadcasts,
  type SessionStatusBroadcast,
  type SessionStatusBroadcastType,
  type BroadcastAudience,
} from "@/lib/sessions/status-broadcast-actions";
import { submitOrQueue } from "@/lib/offline/submit-or-queue";
import { cn } from "@/lib/utils";

// ============================================================
// Props
// ============================================================

interface StatusBroadcastSheetProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional callback fired with the new broadcast on success — used by
   * parent components to show a "broadcast sent" pill on the card. */
  onBroadcastSent?: (broadcast: SessionStatusBroadcast) => void;
}

// ============================================================
// Constants
// ============================================================

const LATE_OPTIONS: ReadonlyArray<5 | 10 | 15 | 20 | 30> = [
  5, 10, 15, 20, 30,
];

const DEFAULT_AUDIENCE: Record<
  SessionStatusBroadcastType,
  BroadcastAudience[]
> = {
  running_late: ["centre", "admin", "parents"],
  on_site: ["centre", "admin"],
  session_over: ["admin"],
};

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  centre: "Centre",
  admin: "Admin & ops",
  parents: "Parents",
};

// ============================================================
// Component
// ============================================================

export function StatusBroadcastSheet({
  sessionId,
  open,
  onOpenChange,
  onBroadcastSent,
}: StatusBroadcastSheetProps) {
  const [status, setStatus] = useState<SessionStatusBroadcastType | null>(null);
  const [lateMinutes, setLateMinutes] = useState<5 | 10 | 15 | 20 | 30>(10);
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience[]>([]);
  const [history, setHistory] = useState<SessionStatusBroadcast[]>([]);
  const [isPending, startTransition] = useTransition();

  // Reset + fetch history when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setMessage("");
    setLateMinutes(10);
    setAudience([]);
    void getSessionStatusBroadcasts(sessionId).then((res) => {
      setHistory(res.data ?? []);
    });
  }, [open, sessionId]);

  // Sync the audience defaults to the active status.
  useEffect(() => {
    if (status) setAudience(DEFAULT_AUDIENCE[status]);
  }, [status]);

  function toggleAudience(target: BroadcastAudience) {
    setAudience((prev) =>
      prev.includes(target)
        ? prev.filter((a) => a !== target)
        : [...prev, target],
    );
  }

  function handleSend() {
    if (!status || audience.length === 0) return;
    startTransition(async () => {
      const payload = {
        sessionId,
        status,
        lateMinutes: status === "running_late" ? lateMinutes : undefined,
        message: message.trim() || undefined,
        broadcastTo: audience,
      };
      // Online → dispatch directly so we get the real broadcast id back for
      // the optimistic pill. Offline → queue and craft a local optimistic
      // record; the actual notification fan-out happens on sync.
      const res = await submitOrQueue("status_broadcast", payload, async (p) => {
        const result = await broadcastSessionStatus(p);
        if (result.error) return { error: result.error };
        if (!result.id) return { error: "Broadcast failed." };
        return { error: null };
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.queued) {
        toast.success("Saved offline — will broadcast when you reconnect.", {
          icon: "📡",
        });
      } else {
        toast.success("Status broadcast sent.");
      }
      // Build an optimistic record so the parent card can pin the pill — we
      // use a local id when queued since the server hasn't issued one yet.
      onBroadcastSent?.({
        id: res.queued ? `pending_${Date.now()}` : sessionId,
        session_id: sessionId,
        coach_id: "",
        coach_name: null,
        status,
        late_minutes: status === "running_late" ? lateMinutes : null,
        message: message.trim() || null,
        broadcast_to: audience,
        created_at: new Date().toISOString(),
      });
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4 text-primary" />
            Broadcast status
          </SheetTitle>
          <SheetDescription>
            Send a quick update to the centre, admin and parents.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {/* Recent broadcasts — quiet badges */}
          {history.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {history.slice(0, 3).map((h) => (
                <Badge
                  key={h.id}
                  variant="secondary"
                  className="rounded-full text-xs font-normal"
                >
                  {labelForHistory(h)}
                </Badge>
              ))}
            </div>
          )}

          {/* 3 big buttons */}
          <div className="grid gap-2">
            <StatusButton
              active={status === "running_late"}
              tone="red"
              icon={<Footprints className="size-5" />}
              label="I'm running late"
              onClick={() => setStatus("running_late")}
            />
            {status === "running_late" && (
              <div className="rounded-2xl border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  How many minutes?
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {LATE_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLateMinutes(m)}
                      className={cn(
                        "min-h-[44px] rounded-xl border text-sm font-medium transition-colors",
                        lateMinutes === m
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-border bg-background text-foreground hover:border-red-300",
                      )}
                      aria-pressed={lateMinutes === m}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <StatusButton
              active={status === "on_site"}
              tone="amber"
              icon={<MapPin className="size-5" />}
              label="On site"
              onClick={() => setStatus("on_site")}
            />
            <StatusButton
              active={status === "session_over"}
              tone="green"
              icon={<CheckCircle2 className="size-5" />}
              label="Session over"
              onClick={() => setStatus("session_over")}
            />
          </div>

          {/* Optional note */}
          <div>
            <label
              htmlFor="status-note"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Add a quick note (optional)
            </label>
            <input
              id="status-note"
              type="text"
              maxLength={100}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Traffic on M5"
              className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              {message.length}/100
            </p>
          </div>

          {/* Audience toggles */}
          {status && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Notify
              </p>
              <div className="flex flex-wrap gap-2">
                {(["centre", "admin", "parents"] as BroadcastAudience[]).map(
                  (a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAudience(a)}
                      className={cn(
                        "min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors",
                        audience.includes(a)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40",
                      )}
                      aria-pressed={audience.includes(a)}
                    >
                      {AUDIENCE_LABEL[a]}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Send */}
          <Button
            onClick={handleSend}
            disabled={!status || audience.length === 0 || isPending}
            className="min-h-[48px] w-full rounded-xl bg-primary text-base font-medium text-white hover:bg-[#d05f1f]"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Notify now"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Sub-component: 64px tap target status button
// ============================================================

function StatusButton({
  active,
  tone,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  tone: "red" | "amber" | "green";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const toneClass = {
    red: active
      ? "border-red-500 bg-red-50 text-red-700"
      : "border-red-200 text-red-700 hover:bg-red-50/60",
    amber: active
      ? "border-amber-500 bg-amber-50 text-amber-800"
      : "border-amber-200 text-amber-800 hover:bg-amber-50/60",
    green: active
      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50/60",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-2 bg-background px-4 text-left font-medium transition-colors",
        toneClass,
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="text-base">{label}</span>
    </button>
  );
}

// ============================================================
// Helpers
// ============================================================

function labelForHistory(b: SessionStatusBroadcast): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(b.created_at).getTime()) / 60_000),
  );
  const ago =
    minutes === 0
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : `${Math.floor(minutes / 60)} hr ago`;
  const stem =
    b.status === "running_late"
      ? `${b.late_minutes ?? ""} min late`
      : b.status === "on_site"
        ? "on site"
        : "session over";
  return `You marked '${stem.trim()}' ${ago}`;
}
