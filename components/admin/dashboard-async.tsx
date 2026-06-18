// ============================================================
// Async server-component wrappers for /admin home
// ============================================================
//
// Each wrapper kicks off ITS OWN data fetch and renders the actual
// widget when the data resolves. Wrap them in <Suspense> at the page
// level so the shell paints in <50ms and widgets stream in
// independently as their data arrives, instead of the page waiting
// for the slowest of six queries before sending any HTML.

import { AdminContextStrip } from "@/components/admin/admin-context-strip";
import { PipelineSnapshot } from "@/components/admin/pipeline-snapshot";
import { PayrollSnapshot } from "@/components/admin/payroll-snapshot";
import { CertExpirySnapshot } from "@/components/admin/cert-expiry-snapshot";
import { LaunchDashboard } from "@/components/launch/launch-dashboard";
import {
  getCachedDashboardMetrics,
  getCachedRecentActivity,
  getCachedAdminStatusPulse,
} from "@/lib/launch/dashboard-cached";
import { getPipelineSnapshot } from "@/lib/crm/metrics-actions";
import { getPayrollSnapshot } from "@/lib/invoicing/payroll-actions";
import { getCertExpirySnapshot } from "@/lib/compliance/dashboard-actions";
import type { Profile } from "@/lib/types/database";

type ProfileSlim = Pick<Profile, "role" | "financial_access" | "name">;

export async function AdminContextStripAsync({ firstName }: { firstName: string }) {
  const pulse = await getCachedAdminStatusPulse();
  return <AdminContextStrip firstName={firstName} pulse={pulse} />;
}

export async function LaunchDashboardAsync({ profile }: { profile: ProfileSlim }) {
  const [metrics, activity] = await Promise.all([
    getCachedDashboardMetrics(),
    getCachedRecentActivity(20),
  ]);
  return (
    <LaunchDashboard
      metrics={metrics}
      initialActivity={activity}
      profile={profile}
    />
  );
}

export async function PipelineSnapshotAsync() {
  const { data } = await getPipelineSnapshot();
  return <PipelineSnapshot initialData={data} />;
}

export async function PayrollSnapshotAsync({ hideFinancial }: { hideFinancial: boolean }) {
  // Skip the round-trip entirely when the viewer can't see financials.
  if (hideFinancial) {
    return <PayrollSnapshot initialData={null} hideFinancial />;
  }
  const { data } = await getPayrollSnapshot();
  return <PayrollSnapshot initialData={data} hideFinancial={false} />;
}

export async function CertExpirySnapshotAsync() {
  const { data } = await getCertExpirySnapshot();
  return <CertExpirySnapshot initialData={data} />;
}

// ============================================================
// Skeletons — fallback content for each Suspense boundary
// ============================================================

function CardSkeleton({ height = "h-32" }: { height?: string }) {
  return (
    <div
      className={`${height} animate-pulse rounded-2xl border bg-gradient-to-br from-muted/40 to-muted/20`}
    />
  );
}

export function AdminContextStripSkeleton({ firstName }: { firstName: string }) {
  return (
    <div className="rounded-2xl border bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-heading text-foreground">
            Good day, {firstName}
          </h1>
          <div className="mt-1 h-3 w-32 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="flex gap-6">
          <div className="h-9 w-14 animate-pulse rounded bg-muted/50" />
          <div className="h-9 w-14 animate-pulse rounded bg-muted/50" />
          <div className="h-9 w-14 animate-pulse rounded bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

export function LaunchDashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton height="h-72" />
        <CardSkeleton height="h-72" />
      </div>
      <CardSkeleton height="h-64" />
    </div>
  );
}

export function SnapshotCardSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-3 h-24 animate-pulse rounded bg-muted/40" />
    </div>
  );
}
