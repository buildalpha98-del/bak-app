import { StartOnboardingButton } from "@/components/onboarding/start-onboarding-button";
import { OnboardingStatusPulseStrip } from "@/components/onboarding/onboarding-status-pulse";
import { OnboardingListView } from "@/components/onboarding/onboarding-list-view";
import { getOnboardingListItems } from "@/lib/onboarding/actions";
import { getOnboardingStatusPulse } from "@/lib/onboarding/status-pulse-actions";
import { getRegions } from "@/lib/regions/actions";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function OpsOnboardingPage() {
  const admin = createSupabaseAdmin();

  // Single fan-out — pulse, list, region picker, and available
  // centres for the Start dialog all resolve in parallel.
  const [items, pulse, regionsRes, centresRes, activeCentreIds] =
    await Promise.all([
      getOnboardingListItems(),
      getOnboardingStatusPulse(),
      getRegions(),
      admin
        .from("centres")
        .select("id, name")
        .order("name", { ascending: true }),
      admin
        .from("centre_onboarding_checklists")
        .select("centre_id")
        .eq("status", "in_progress"),
    ]);

  const activeIds = new Set(
    (activeCentreIds.data ?? []).map((row) => row.centre_id),
  );
  const availableCentres = (centresRes.data ?? []).filter(
    (c) => !activeIds.has(c.id),
  );
  const regions = (regionsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#E8712A] mb-1">
            Operations
          </p>
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
            Centre Onboarding
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track centre onboarding progress and chase what's behind.
          </p>
        </div>
        <StartOnboardingButton centres={availableCentres} />
      </div>

      <OnboardingStatusPulseStrip pulse={pulse} basePath="/ops/onboarding" />

      <OnboardingListView
        items={items}
        regions={regions}
        basePath="/ops/onboarding"
      />
    </div>
  );
}
