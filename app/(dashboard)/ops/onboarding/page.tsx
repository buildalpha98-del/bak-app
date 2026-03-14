import { ClipboardList } from "lucide-react";
import { ActiveOnboardingsWidget } from "@/components/onboarding/active-onboardings-widget";
import { getActiveOnboardings } from "@/lib/onboarding/actions";

export default async function OpsOnboardingPage() {
  const onboardings = await getActiveOnboardings();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Active Onboardings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track centre onboarding progress across all active centres
        </p>
      </div>

      {/* Widget */}
      <ActiveOnboardingsWidget onboardings={onboardings} />
    </div>
  );
}
