import { LaunchDashboard } from "@/components/launch/launch-dashboard";
import {
  getDashboardMetrics,
  getRecentActivity,
} from "@/lib/launch/dashboard-actions";

export default async function AdminDashboard() {
  const [metrics, activity] = await Promise.all([
    getDashboardMetrics(),
    getRecentActivity(20),
  ]);

  return (
    <div className="animate-fade-up">
      <LaunchDashboard metrics={metrics} initialActivity={activity} />
    </div>
  );
}
