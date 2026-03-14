"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRightLeft } from "lucide-react";
import { SwapRequestCard } from "./swap-request-card";
import { useSwapRequestsRealtime } from "@/lib/hooks/useSwapRequestsRealtime";
import type { SwapRequestWithDetails } from "@/lib/sessions/shift-actions";

// ============================================================
// Props
// ============================================================

interface SwapManagementViewProps {
  pendingSwaps: SwapRequestWithDetails[];
  historySwaps: SwapRequestWithDetails[];
}

// ============================================================
// Component
// ============================================================

export function SwapManagementView({
  pendingSwaps,
  historySwaps,
}: SwapManagementViewProps) {
  const router = useRouter();

  // Realtime subscription for live updates
  const handleUpdate = useCallback(() => {
    router.refresh();
  }, [router]);

  useSwapRequestsRealtime(handleUpdate);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="size-5 text-primary" />
        <h1 className="text-xl font-semibold text-foreground">
          Swap Requests
        </h1>
        {pendingSwaps.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {pendingSwaps.length} pending
          </span>
        )}
      </div>

      <Tabs defaultValue="pending">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="pending" className="min-h-[44px]">
            Pending ({pendingSwaps.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="min-h-[44px]">
            History ({historySwaps.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingSwaps.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 p-8 text-center">
              <ArrowRightLeft className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No pending swap requests.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSwaps.map((swap) => (
                <SwapRequestCard
                  key={swap.id}
                  swap={swap}
                  mode="pending"
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historySwaps.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 p-8 text-center">
              <ArrowRightLeft className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No swap request history yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {historySwaps.map((swap) => (
                <SwapRequestCard
                  key={swap.id}
                  swap={swap}
                  mode="history"
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
