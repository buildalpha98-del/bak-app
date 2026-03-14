import {
  getTrainingAnalytics,
  getCoachTrainingLeaderboard,
} from "@/lib/training/analytics-actions";
import { TrainingAnalyticsView } from "@/components/training/training-analytics-view";

export default async function OpsTrainingAnalyticsPage() {
  const [analytics, leaderboard] = await Promise.all([
    getTrainingAnalytics(),
    getCoachTrainingLeaderboard(),
  ]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Operations
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Training Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-wide training completion and performance insights.
        </p>
      </div>

      <TrainingAnalyticsView analytics={analytics} leaderboard={leaderboard} />
    </div>
  );
}
