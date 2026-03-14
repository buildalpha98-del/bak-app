import { FeedbackSummaryWidget } from "@/components/feedback/feedback-summary-widget";
import { StatsCards } from "@/components/admin/stats-cards";
import { getAdminDashboardStats } from "@/lib/admin/dashboard-stats";

export default async function AdminDashboard() {
  const stats = await getAdminDashboardStats();

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Overview
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Admin Dashboard
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Monitor your centres, coaches, and sessions across the Build Alpha Kids network.
        </p>
      </div>

      {/* Stats grid */}
      <StatsCards stats={stats} />

      {/* Widgets grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeedbackSummaryWidget />
      </div>
    </div>
  );
}
