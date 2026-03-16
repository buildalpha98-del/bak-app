import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";
import { getCentreOnboarding } from "@/lib/onboarding/actions";

interface OnboardingPageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsCentreOnboardingPage({
  params,
}: OnboardingPageProps) {
  const { id } = await params;
  const data = await getCentreOnboarding(id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href={`/ops/centres/${id}`} />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
              Centre Onboarding
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track onboarding progress for this centre
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {data ? (
        <OnboardingChecklist
          centreId={id}
          checklist={data.checklist}
          steps={data.steps}
          emails={data.emails}
        />
      ) : (
        <OnboardingBanner
          centreId={id}
          checklist={null}
          completedSteps={0}
          totalSteps={10}
        />
      )}
    </div>
  );
}
