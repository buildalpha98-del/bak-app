import { ActiveOnboardingsWidget } from "@/components/onboarding/active-onboardings-widget";
import { StartOnboardingButton } from "@/components/onboarding/start-onboarding-button";
import { getActiveOnboardings } from "@/lib/onboarding/actions";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export default async function OpsOnboardingPage() {
  const admin = createSupabaseAdmin();

  const [onboardings, centresRes, activeCentreIds] = await Promise.all([
    getActiveOnboardings(),
    admin.from("centres").select("id, name").order("name", { ascending: true }),
    admin
      .from("centre_onboarding_checklists")
      .select("centre_id")
      .eq("status", "in_progress"),
  ]);

  const activeIds = new Set(
    (activeCentreIds.data ?? []).map((row) => row.centre_id)
  );
  const availableCentres = (centresRes.data ?? []).filter(
    (c) => !activeIds.has(c.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
            Active Onboardings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track centre onboarding progress across all active centres
          </p>
        </div>
        <StartOnboardingButton centres={availableCentres} />
      </div>

      {/* Widget */}
      <ActiveOnboardingsWidget onboardings={onboardings} />
    </div>
  );
}
