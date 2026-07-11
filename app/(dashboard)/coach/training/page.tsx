import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyTrainingDashboard } from "@/lib/training/coach-actions";
import { getCoachTrainingPulse } from "@/lib/coach/page-pulses";
import { CoachTrainingDashboard } from "@/components/training/coach-training-dashboard";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";
import {
  AlertTriangle,
  Clock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export default async function CoachTrainingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [dashboard, pulse] = await Promise.all([
    getMyTrainingDashboard(),
    getCoachTrainingPulse(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Coach
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          My Training
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete your assigned training modules and pathways.
        </p>
      </div>

      <div className="animate-fade-up stagger-1">
        <CoachPulseStrip
          items={[
            {
              icon: "alert-triangle",
              count: pulse.overdueCount,
              label: "overdue",
              accent: true,
            },
            {
              icon: "clock",
              count: pulse.dueSoonCount,
              label: "due in 7 days",
              accent: pulse.dueSoonCount > 0,
            },
            {
              icon: "sparkles",
              count: pulse.newCount,
              label: "new this week",
            },
            {
              icon: "check-circle",
              count: pulse.completedCount,
              label: "completed",
            },
          ]}
        />
      </div>

      <div className="animate-fade-up stagger-2">
        <CoachTrainingDashboard
          assigned={dashboard.assigned}
          inProgress={dashboard.in_progress}
          completed={dashboard.completed}
        />
      </div>
    </div>
  );
}
