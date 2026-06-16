import { redirect } from "next/navigation";

import { LaunchDashboard } from "@/components/launch/launch-dashboard";
import { QuickActionsRow } from "@/components/admin/quick-actions-row";
import { AdminContextStrip } from "@/components/admin/admin-context-strip";
import { PipelineSnapshot } from "@/components/admin/pipeline-snapshot";
import { PayrollSnapshot } from "@/components/admin/payroll-snapshot";
import { CertExpirySnapshot } from "@/components/admin/cert-expiry-snapshot";

import {
  getDashboardMetrics,
  getRecentActivity,
  getAdminStatusPulse,
} from "@/lib/launch/dashboard-actions";
import { getPipelineSnapshot } from "@/lib/crm/metrics-actions";
import { getPayrollSnapshot } from "@/lib/invoicing/payroll-actions";
import { getCertExpirySnapshot } from "@/lib/compliance/dashboard-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  // Profile is required up front to plumb financial_access into the
  // dashboard + decide whether to fetch payroll data at all.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, financial_access, name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const hasFinancial = !!profile.financial_access;

  // Single fan-out: 6 data sources resolved in parallel so the LCP is
  // bottlenecked by the slowest one, not the sum. We skip payroll
  // entirely when the viewer can't see it — that keeps the round-trip
  // count honest for ops-tier admins.
  const [metrics, activity, pulse, pipelineRes, payrollRes, certRes] =
    await Promise.all([
      getDashboardMetrics(),
      getRecentActivity(20),
      getAdminStatusPulse(),
      getPipelineSnapshot(),
      hasFinancial
        ? getPayrollSnapshot()
        : Promise.resolve({ data: null, error: null }),
      getCertExpirySnapshot(),
    ]);

  const firstName = (profile.name ?? "").split(" ")[0] || "there";

  return (
    <div className="space-y-6 animate-fade-up">
      <AdminContextStrip firstName={firstName} pulse={pulse} />

      <QuickActionsRow />

      <LaunchDashboard
        metrics={metrics}
        initialActivity={activity}
        profile={profile}
      />

      {/* Growth + ops snapshot widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PipelineSnapshot initialData={pipelineRes.data} />
        <PayrollSnapshot
          initialData={payrollRes.data}
          hideFinancial={!hasFinancial}
        />
        <CertExpirySnapshot initialData={certRes.data} />
      </div>
    </div>
  );
}
