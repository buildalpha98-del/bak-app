"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";
import { useSessionsRealtime } from "@/lib/hooks/useSessionsRealtime";
import {
  BulkConfirmDialog,
  type PendingSession,
} from "@/components/coach/schedule/bulk-confirm-dialog";

// ============================================================
// Props
// ============================================================

interface ScheduleTabsWrapperProps {
  activeTab: "today" | "week" | "term";
  /** Current date for realtime key */
  currentDate: string;
  /** Pending sessions for bulk confirm (optional) */
  pendingSessions?: PendingSession[];
  children: {
    today: React.ReactNode;
    week: React.ReactNode;
    term: React.ReactNode;
  };
}

// ============================================================
// Component
// ============================================================

export function ScheduleTabsWrapper({
  activeTab,
  currentDate,
  pendingSessions,
  children,
}: ScheduleTabsWrapperProps) {
  const router = useRouter();
  const [bulkOpen, setBulkOpen] = useState(false);

  // Realtime subscription for live updates
  const handleUpdate = useCallback(() => {
    router.refresh();
  }, [router]);

  useSessionsRealtime(currentDate, handleUpdate);

  function handleTabChange(value: string | number | null) {
    if (typeof value !== "string") return;
    const tab = value as "today" | "week" | "term";
    if (tab === activeTab) return;

    const params = new URLSearchParams();
    if (tab !== "today") params.set("tab", tab);
    const qs = params.toString();
    router.push(`/coach/schedule${qs ? `?${qs}` : ""}`);
  }

  const showBulkConfirm = pendingSessions && pendingSessions.length > 1;

  return (
    <>
      {/* Bulk confirm banner */}
      {showBulkConfirm && (
        <Button
          variant="outline"
          onClick={() => setBulkOpen(true)}
          className="w-full min-h-[44px] border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <CheckCheck className="mr-2 size-4" />
          Confirm All ({pendingSessions.length} pending shifts)
        </Button>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="today" className="min-h-[44px]">
            Today
          </TabsTrigger>
          <TabsTrigger value="week" className="min-h-[44px]">
            Week
          </TabsTrigger>
          <TabsTrigger value="term" className="min-h-[44px]">
            Term
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          {children.today}
        </TabsContent>
        <TabsContent value="week" className="mt-4">
          {children.week}
        </TabsContent>
        <TabsContent value="term" className="mt-4">
          {children.term}
        </TabsContent>
      </Tabs>

      {/* Bulk confirm dialog */}
      {showBulkConfirm && (
        <BulkConfirmDialog
          sessions={pendingSessions}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
        />
      )}
    </>
  );
}
