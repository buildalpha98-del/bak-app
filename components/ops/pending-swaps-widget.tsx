"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import {
  opsApproveSwap,
  opsRejectSwap,
} from "@/lib/sessions/shift-actions";
import type { SwapRequestWithDetails } from "@/lib/sessions/shift-actions";

// ============================================================
// Pending Swaps widget for command centre
// ============================================================

function formatTime12hr(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

interface PendingSwapsWidgetProps {
  swapRequests: SwapRequestWithDetails[];
  onRefresh: () => void;
}

export function PendingSwapsWidget({ swapRequests, onRefresh }: PendingSwapsWidgetProps) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function setLoading(id: string, loading: boolean) {
    setLoadingIds((prev) => {
      const next = new Set(prev);
      if (loading) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleApprove(id: string) {
    setLoading(id, true);
    try {
      const result = await opsApproveSwap(id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Swap approved");
        onRefresh();
      }
    } catch {
      toast.error("Failed to approve swap");
    } finally {
      setLoading(id, false);
    }
  }

  async function handleReject(id: string) {
    setLoading(id, true);
    try {
      const result = await opsRejectSwap(id, rejectReason || undefined);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Swap rejected");
        setRejectingId(null);
        setRejectReason("");
        onRefresh();
      }
    } catch {
      toast.error("Failed to reject swap");
    } finally {
      setLoading(id, false);
    }
  }

  return (
    <WidgetWrapper title="Pending Swaps" icon={ArrowLeftRight} count={swapRequests.length}>
      {swapRequests.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No pending swaps</p>
      ) : (
        <div className="divide-y divide-border/50">
          {swapRequests.map((swap) => {
            const isLoading = loadingIds.has(swap.id);
            const isRejecting = rejectingId === swap.id;

            return (
              <div key={swap.id} className="py-3 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {swap.requesting_coach_name}
                  <span className="mx-1.5 text-muted-foreground">&rarr;</span>
                  {swap.proposed_coach_name}
                </p>

                <p className="text-sm text-muted-foreground">
                  {new Date(swap.session_date).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  at {formatTime12hr(swap.session_time)} &middot; {swap.session_sport} at{" "}
                  {swap.centre_name}
                </p>

                <p className="text-xs text-muted-foreground/70">
                  Requested{" "}
                  {new Date(swap.created_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>

                {isRejecting && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Reason (optional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleReject(swap.id)}
                    >
                      {isLoading ? "Rejecting..." : "Confirm"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {!isRejecting && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleApprove(swap.id)}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {isLoading ? "Approving..." : "Approve"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      className="border-destructive/30 text-destructive hover:bg-destructive/5"
                      onClick={() => setRejectingId(swap.id)}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </WidgetWrapper>
  );
}
