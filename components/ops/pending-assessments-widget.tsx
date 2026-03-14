"use client";

import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import type { PendingAssessmentItem } from "@/lib/ops/actions";

// ============================================================
// Pending Assessments — command centre widget
// ============================================================

interface PendingAssessmentsWidgetProps {
  assessments: PendingAssessmentItem[];
}

function completionPercentage(rated: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((rated / total) * 100);
}

export function PendingAssessmentsWidget({
  assessments,
}: PendingAssessmentsWidgetProps) {
  return (
    <WidgetWrapper
      title="Pending Assessments"
      icon={ClipboardCheck}
      count={assessments.length}
    >
      {assessments.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          All assessments are up to date
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {assessments.map((item) => {
            const pct = completionPercentage(
              item.rated_children,
              item.total_children
            );

            return (
              <div
                key={item.template_id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.sport}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {item.centre_name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {item.age_group} yrs
                    </Badge>
                    {item.coach_name && (
                      <span className="text-xs text-muted-foreground">
                        {item.coach_name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {pct}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.rated_children}/{item.total_children} rated
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetWrapper>
  );
}
