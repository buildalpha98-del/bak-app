"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
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
import { PendingAssessmentsWidget } from "@/components/ops/pending-assessments-widget";
import { RecentRatingsWidget } from "@/components/ops/recent-ratings-widget";
import { ActiveRerosteringWidget } from "@/components/ops/active-rerostering-widget";

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
    pendingAssessments: props.pendingAssessments,
    activeRerosteringEvents: props.activeRerosteringEvents,
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
    } catch {
      toast.error("Could not refresh command centre data.");
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rerostering_events" },
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
      <div className="flex items-start justify-between animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Operations
          </p>
          <h1 className="text-3xl font-bold text-foreground font-heading tracking-tight page-header-sport">
            Command Centre
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{formatTodayDate()}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            Updated {lastRefreshedLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
            className="transition-all duration-200"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Today's Sessions — full width hero */}
      <div className="animate-fade-up stagger-1">
        <TodaysSessionsWidget
          sessions={data.todaySessions}
          stats={data.todayStats}
        />
      </div>

      {/* Widget grid — 2 cols desktop, 1 col mobile */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left column — action items (higher urgency) */}
        <div className="space-y-4">
          <div className="animate-fade-up stagger-2">
            <UnconfirmedShiftsWidget
              shifts={data.unconfirmedShifts}
              onRefresh={refreshAll}
            />
          </div>
          <div className="animate-fade-up stagger-3">
            <PendingSwapsWidget
              swapRequests={data.swapRequests}
              onRefresh={refreshAll}
            />
          </div>
          <div className="animate-fade-up stagger-4">
            <ActiveRerosteringWidget
              events={data.activeRerosteringEvents as any}
            />
          </div>
          <div className="animate-fade-up stagger-5">
            <ComplianceAlertsWidget
              alerts={data.complianceAlerts}
              onRefresh={refreshAll}
            />
          </div>
        </div>

        {/* Right column — monitoring */}
        <div className="space-y-4">
          <div className="animate-fade-up stagger-2">
            <EquipmentIssuesWidget
              issues={data.equipmentIssues}
              onRefresh={refreshAll}
            />
          </div>
          <div className="animate-fade-up stagger-3">
            <MyTasksWidget tasks={data.tasks} onRefresh={refreshAll} />
          </div>
          <div className="animate-fade-up stagger-4">
            <PendingAssessmentsWidget
              assessments={data.pendingAssessments}
            />
          </div>
          <div className="animate-fade-up stagger-5">
            <RecentRatingsWidget
              ratings={data.recentRatings}
              onRefresh={refreshAll}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
