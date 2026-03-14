"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrainingComplianceBadge } from "./training-compliance-badge";
import { ShieldCheck } from "lucide-react";

interface CoachComplianceData {
  id: string;
  name: string;
  overdueCount: number;
  overdueModules: string[];
}

interface TrainingComplianceWidgetProps {
  coaches: CoachComplianceData[];
}

export function TrainingComplianceWidget({
  coaches,
}: TrainingComplianceWidgetProps) {
  const overdueCoaches = coaches.filter((c) => c.overdueCount > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Training Compliance
        </CardTitle>
        <CardDescription className="text-xs">
          Coaches with overdue training modules
        </CardDescription>
      </CardHeader>
      <CardContent>
        {overdueCoaches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            All coaches are up to date with training
          </p>
        ) : (
          <ul className="space-y-3">
            {overdueCoaches.map((coach) => (
              <li
                key={coach.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm font-medium truncate">
                  {coach.name}
                </span>
                <TrainingComplianceBadge
                  coachId={coach.id}
                  overdueCount={coach.overdueCount}
                  overdueModules={coach.overdueModules}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
