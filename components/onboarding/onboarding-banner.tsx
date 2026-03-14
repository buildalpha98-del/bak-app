"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { startCentreOnboarding } from "@/lib/onboarding/actions";
import type { CentreOnboardingChecklist } from "@/lib/types/database";

// ============================================================
// Component
// ============================================================

interface OnboardingBannerProps {
  centreId: string;
  checklist: CentreOnboardingChecklist | null;
  completedSteps: number;
  totalSteps: number;
}

export function OnboardingBanner({
  centreId,
  checklist,
  completedSteps,
  totalSteps,
}: OnboardingBannerProps) {
  const [isPending, startTransition] = useTransition();
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  function handleStart() {
    startTransition(async () => {
      const result = await startCentreOnboarding(centreId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Onboarding started.");
      }
    });
  }

  // No checklist yet — show start button
  if (!checklist) {
    return (
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Centre onboarding has not been started
            </span>
          </div>
          <Button size="sm" onClick={handleStart} disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            Start Onboarding
          </Button>
        </div>
      </div>
    );
  }

  // Completed
  if (checklist.status === "completed") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" />
          <Badge
            variant="default"
            className="bg-green-600 hover:bg-green-700"
          >
            Onboarding Complete
          </Badge>
        </div>
      </div>
    );
  }

  // In progress (or stalled)
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-amber-600" />
            <span className="text-sm font-medium text-foreground">
              {completedSteps} of {totalSteps} steps complete
            </span>
            {checklist.status === "stalled" && (
              <Badge variant="destructive" className="text-xs">
                Stalled
              </Badge>
            )}
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          render={
            <Link href={`/admin/centres/${centreId}/onboarding`} />
          }
        >
          View Checklist
        </Button>
      </div>
    </div>
  );
}
