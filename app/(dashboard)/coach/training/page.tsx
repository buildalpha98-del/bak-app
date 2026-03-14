import { getMyTrainingDashboard } from "@/lib/training/coach-actions";
import { CoachTrainingDashboard } from "@/components/training/coach-training-dashboard";

export default async function CoachTrainingPage() {
  const dashboard = await getMyTrainingDashboard();

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

      <CoachTrainingDashboard
        assigned={dashboard.assigned}
        inProgress={dashboard.in_progress}
        completed={dashboard.completed}
      />
    </div>
  );
}
