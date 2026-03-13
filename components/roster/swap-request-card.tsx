"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, X, Loader2, Clock } from "lucide-react";
import { opsApproveSwap, opsRejectSwap } from "@/lib/sessions/shift-actions";
import type { SwapRequestWithDetails } from "@/lib/sessions/shift-actions";
import { formatTime12, formatDateShort } from "@/lib/utils/roster";

// ============================================================
// Status badge
// ============================================================

function SwapStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_ops: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-secondary text-muted-foreground",
  };

  const labels: Record<string, string> = {
    pending_ops: "Awaiting Approval",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? "bg-secondary text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ============================================================
// Props
// ============================================================

interface SwapRequestCardProps {
  swap: SwapRequestWithDetails;
  mode: "pending" | "history";
}

// ============================================================
// Component
// ============================================================

export function SwapRequestCard({ swap, mode }: SwapRequestCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await opsApproveSwap(swap.id);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await opsRejectSwap(
        swap.id,
        rejectReason.trim() || undefined
      );
      if (result.error) {
        setError(result.error);
      } else {
        setRejectOpen(false);
        setRejectReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Session info */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {swap.session_sport} — {swap.centre_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateShort(swap.session_date)} ·{" "}
            {formatTime12(swap.session_time)}
          </p>
        </div>
        <SwapStatusBadge status={swap.status} />
      </div>

      {/* Coach swap direction */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">
          {swap.requesting_coach_name}
        </span>
        <ArrowRight className="size-4 text-muted-foreground" />
        <span className="font-medium text-primary">
          {swap.proposed_coach_name}
        </span>
      </div>

      {/* Timestamps for history */}
      {mode === "history" && swap.ops_responded_at && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {new Date(swap.ops_responded_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* Pending mode actions */}
      {mode === "pending" && (
        <div className="space-y-2">
          {!rejectOpen ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isPending}
                className="min-h-[44px] flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Check className="mr-1 size-4" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={isPending}
                className="min-h-[44px] flex-1 border-red-300 text-red-600 hover:bg-red-50"
              >
                <X className="mr-1 size-4" />
                Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)…"
                rows={2}
                className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                aria-label="Rejection reason"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRejectOpen(false);
                    setRejectReason("");
                  }}
                  disabled={isPending}
                  className="min-h-[44px] flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleReject}
                  disabled={isPending}
                  className="min-h-[44px] flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Confirm Reject"
                  )}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
