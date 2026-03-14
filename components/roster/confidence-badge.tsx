"use client";

import { Circle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CONFIDENCE_COLOURS = {
  green: { fill: "#22c55e", text: "text-green-600" },
  amber: { fill: "#f59e0b", text: "text-amber-500" },
  red: { fill: "#ef4444", text: "text-red-500" },
} as const;

const CONFIDENCE_LABELS = {
  green: "High confidence",
  amber: "Moderate confidence",
  red: "Needs attention",
} as const;

interface ConfidenceBadgeProps {
  confidence: "green" | "amber" | "red";
  reasoning: string[];
}

export function ConfidenceBadge({ confidence, reasoning }: ConfidenceBadgeProps) {
  const { fill } = CONFIDENCE_COLOURS[confidence];
  const label = CONFIDENCE_LABELS[confidence];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help" aria-label={label}>
            <Circle
              className="size-2.5"
              fill={fill}
              stroke={fill}
              strokeWidth={0}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <p className="text-xs font-medium">{label}</p>
          {reasoning.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {reasoning.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
