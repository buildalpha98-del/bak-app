"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCommandCentreData } from "@/lib/ops/actions";
import type { CommandCentreData } from "@/lib/ops/actions";
import { TodaysSessionsWidget } from "@/components/ops/todays-sessions-widget";
import { UnconfirmedShiftsWidget } from "@/components/ops/unconfirmed-shifts-widget";
import { PendingSwapsWidget } from "@/components/ops/pending-swaps-widget";
import { ComplianceAlertsWidget } from "@/components/ops/compliance-alerts-widget";
import { EquipmentIssuesWidget } from "@/components/ops/equipment-issues-widget";
import { MyTasksWidget } from "@/components/ops/my-tasks-widget";
import { RecentRatingsWidget } from "@/components/ops/recent-ratings-widget";

// ============================================================
// Command Centre — ops dashboard orchestrator
// ============================================================

interface CommandCentreProps extends CommandCentreData {
  userId: string;
}

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  return `${Math.floor(diffMins / 60)}h ago`;
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function CommandCentre(props: CommandCentreProps) {
  const { userId } = props;

  const [data, setData] = useState<CommandCentreData>({
    todaySessions: props.todaySessions,
    todayStats: props.todayStats,
    unconfirmedShifts: props.unconfirmedShifts,
    swapRequests: props.swapRequests,
    complianceAlerts: props.complianceAlerts,
    equipmentIssues: props.equipmentIssues,
    tasks: props.tasks,
    recentRatings: props.recentRatings,
  });

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState("just now");

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getCommandCentreData(userId);
      setData(fresh);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Command centre refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(refreshAll, 60_000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Update "last refreshed" label every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefreshedLabel(timeAgo(lastRefreshed));
    }, 30_000);
    setLastRefreshedLabel(timeAgo(lastRefreshed));
    return () => clearInterval(interval);
  }, [lastRefreshed]);

  // Supabase Realtime subscriptions
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel("command-centre-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => refreshAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swap_requests" },
        () => refreshAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback_ratings" },
        () => refreshAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshAll]);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Command Centre
          </h1>
          <p className="mt-1 text-sm text-[#666666]">{formatTodayDate()}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-[#666666] sm:block">
            Updated {lastRefreshedLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Today's Sessions — full width hero */}
      <TodaysSessionsWidget
        sessions={data.todaySessions}
        stats={data.todayStats}
      />

      {/* Widget grid — 2 cols desktop, 1 col mobile */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left column — action items (higher urgency) */}
        <div className="space-y-4">
          <UnconfirmedShiftsWidget
            shifts={data.unconfirmedShifts}
            onRefresh={refreshAll}
          />
          <PendingSwapsWidget
            swapRequests={data.swapRequests}
            onRefresh={refreshAll}
          />
          <ComplianceAlertsWidget
            alerts={data.complianceAlerts}
            onRefresh={refreshAll}
          />
        </div>

        {/* Right column — monitoring */}
        <div className="space-y-4">
          <EquipmentIssuesWidget
            issues={data.equipmentIssues}
            onRefresh={refreshAll}
          />
          <MyTasksWidget tasks={data.tasks} onRefresh={refreshAll} />
          <RecentRatingsWidget
            ratings={data.recentRatings}
            onRefresh={refreshAll}
          />
        </div>
      </div>
    </div>
  );
}
