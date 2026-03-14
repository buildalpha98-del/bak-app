import { FeedbackSummaryWidget } from "@/components/feedback/feedback-summary-widget";
import { StatsCards } from "@/components/admin/stats-cards";
import { getAdminDashboardStats } from "@/lib/admin/dashboard-stats";

export default async function AdminDashboard() {
  const stats = await getAdminDashboardStats();

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold font-heading text-foreground">Admin Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome to the Build Alpha Kids admin portal.
      </p>
      <div className="mt-6">
        <StatsCards stats={stats} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeedbackSummaryWidget />
      </div>
    </div>
  );
}
