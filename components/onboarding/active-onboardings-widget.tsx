"use client";

import Link from "@/components/ui/app-link";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CentreOnboardingChecklist } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface ActiveOnboarding {
  checklist: CentreOnboardingChecklist;
  centre: { id: string; name: string };
  completedSteps: number;
  totalSteps: number;
  daysSinceStart: number;
}

interface ActiveOnboardingsWidgetProps {
  onboardings: ActiveOnboarding[];
  basePath?: string;
}

// ============================================================
// Component
// ============================================================

export function ActiveOnboardingsWidget({
  onboardings,
  basePath = "/admin",
}: ActiveOnboardingsWidgetProps) {
  if (onboardings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            Active Onboardings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
            <ClipboardList className="mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No active onboardings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            Active Onboardings
          </CardTitle>
          <Badge variant="secondary">{onboardings.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {onboardings.map((item) => {
            const isStalled = item.daysSinceStart > 14;
            const progressPercent =
              item.totalSteps > 0
                ? (item.completedSteps / item.totalSteps) * 100
                : 0;

            return (
              <Link
                key={item.checklist.id}
                href={`${basePath}/centres/${item.centre.id}/onboarding`}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.centre.name}
                      </span>
                      {isStalled && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="size-3.5" />
                          Stalled
                        </span>
                      )}
                    </div>
                    <Progress value={progressPercent} className="h-1.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {item.completedSteps} of {item.totalSteps} steps
                      </span>
                      <span>
                        {item.daysSinceStart} day{item.daysSinceStart !== 1 ? "s" : ""} ago
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
