"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface TrainingComplianceBadgeProps {
  coachId: string;
  overdueCount: number;
  overdueModules: string[];
}

export function TrainingComplianceBadge({
  overdueCount,
  overdueModules,
}: TrainingComplianceBadgeProps) {
  if (overdueCount === 0) {
    return (
      <Badge
        variant="outline"
        className="border-green-200 bg-green-50 text-green-700"
      >
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Training Complete
      </Badge>
    );
  }

  const isHighSeverity = overdueCount >= 3;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={
              isHighSeverity
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {isHighSeverity ? (
              <XCircle className="mr-1 h-3 w-3" />
            ) : (
              <AlertTriangle className="mr-1 h-3 w-3" />
            )}
            {overdueCount} module{overdueCount !== 1 ? "s" : ""} overdue
            {isHighSeverity && " — scheduling penalty active"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-semibold text-sm mb-1">Overdue modules:</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {overdueModules.map((mod) => (
              <li key={mod}>{mod}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
