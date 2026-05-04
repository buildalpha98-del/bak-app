import { LaunchDashboard } from "@/components/launch/launch-dashboard";
import {
  getDashboardMetrics,
  getRecentActivity,
} from "@/lib/launch/dashboard-actions";
import { PipelineSnapshot } from "@/components/admin/pipeline-snapshot";
import { PayrollSnapshot } from "@/components/admin/payroll-snapshot";
import { CertExpirySnapshot } from "@/components/admin/cert-expiry-snapshot";

export default async function AdminDashboard() {
  const [metrics, activity] = await Promise.all([
    getDashboardMetrics(),
    getRecentActivity(20),
  ]);

  return (
    <div className="space-y-8 animate-fade-up">
      <LaunchDashboard metrics={metrics} initialActivity={activity} />

      {/* Growth + ops snapshot widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PipelineSnapshot />
        <PayrollSnapshot />
        <CertExpirySnapshot />
      </div>
    </div>
  );
}
