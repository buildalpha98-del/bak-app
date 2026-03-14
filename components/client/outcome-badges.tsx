"use client";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface Outcome {
  framework: string;
  code: string;
  title: string;
  description: string;
}

interface OutcomeBadgesProps {
  outcomes: Outcome[];
  compact?: boolean;
}

function outcomeColour(framework: string): string {
  if (framework.toUpperCase().includes("EYLF")) {
    return "bg-teal-100 text-teal-700";
  }
  if (
    framework.toUpperCase().includes("PDHPE") ||
    framework.toUpperCase().includes("PD")
  ) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-gray-100 text-gray-600";
}

export function OutcomeBadges({ outcomes, compact = false }: OutcomeBadgesProps) {
  if (!outcomes || outcomes.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1.5">
        {outcomes.map((outcome, idx) => (
          <Tooltip key={`${outcome.code}-${idx}`}>
            <TooltipTrigger>
              <span
                className={`inline-flex cursor-default items-center rounded-full border border-transparent px-2 py-0.5 font-medium ${outcomeColour(outcome.framework)} ${compact ? "text-xs" : "text-xs"}`}
              >
                {outcome.code}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              <div className="max-w-60 space-y-0.5">
                <p className="font-semibold">{outcome.title}</p>
                {outcome.description && (
                  <p className="text-xs opacity-80">{outcome.description}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
