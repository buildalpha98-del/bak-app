import { redirect } from "next/navigation";
import { Suspense } from "react";

import { QuickActionsRow } from "@/components/admin/quick-actions-row";
import {
  AdminContextStripAsync,
  LaunchDashboardAsync,
  PipelineSnapshotAsync,
  PayrollSnapshotAsync,
  CertExpirySnapshotAsync,
  AdminContextStripSkeleton,
  LaunchDashboardSkeleton,
  SnapshotCardSkeleton,
} from "@/components/admin/dashboard-async";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ============================================================
// /admin — admin landing page (streaming)
// ============================================================
//
// The shell paints in <50ms — only profile + auth check happen
// up-front. Each widget kicks off its own data fetch behind a
// Suspense boundary, so the user sees skeletons immediately and
// content streams in as queries resolve. The slowest widget no
// longer dictates time-to-first-byte for the whole page.
//
// Vercel region is pinned to syd1 (matching Supabase ap-southeast-2)
// in vercel.json so each query stays in-region. Functions and database
// must always share a region; the users are in Sydney too.

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, financial_access, name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");

  const firstName = (profile.name ?? "").split(" ")[0] || "there";
  const hasFinancial = !!profile.financial_access;

  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<AdminContextStripSkeleton firstName={firstName} />}>
        <AdminContextStripAsync firstName={firstName} />
      </Suspense>

      <QuickActionsRow />

      <Suspense fallback={<LaunchDashboardSkeleton />}>
        <LaunchDashboardAsync profile={profile} />
      </Suspense>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<SnapshotCardSkeleton title="CRM pipeline" />}>
          <PipelineSnapshotAsync />
        </Suspense>
        <Suspense fallback={<SnapshotCardSkeleton title="Payroll" />}>
          <PayrollSnapshotAsync hideFinancial={!hasFinancial} />
        </Suspense>
        <Suspense fallback={<SnapshotCardSkeleton title="Certifications" />}>
          <CertExpirySnapshotAsync />
        </Suspense>
      </div>
    </div>
  );
}
