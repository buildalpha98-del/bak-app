"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  computeSessionVariance,
  varianceLabel,
  varianceDescription,
  type VarianceStatus,
} from "@/lib/utils/sessions/variance";

const STATUS_STYLES: Record<
  Exclude<VarianceStatus, "none">,
  { bg: string; text: string; border: string }
> = {
  active: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  "on-time": {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  early: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  late: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  "very-late": {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
  },
};

interface VarianceBadgeProps {
  date: string;
  time: string;
  durationMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  /** Visual size — `xs` is for the weekly grid, `sm` for the detail sheet. */
  size?: "xs" | "sm";
}

export function VarianceBadge({
  date,
  time,
  durationMinutes,
  startedAt,
  completedAt,
  size = "xs",
}: VarianceBadgeProps) {
  const variance = computeSessionVariance({
    date,
    time,
    duration_minutes: durationMinutes,
    started_at: startedAt,
    completed_at: completedAt,
  });

  if (variance.status === "none") return null;

  const style = STATUS_STYLES[variance.status];
  const label = varianceLabel(variance);
  const desc = varianceDescription(variance);
  const sizeCls =
    size === "xs"
      ? "px-1 py-0 text-[9px]"
      : "px-2 py-0.5 text-xs";

  const endNote =
    variance.endDeltaMin != null
      ? variance.endDeltaMin > 5
        ? ` · ran ${variance.endDeltaMin} min over`
        : variance.endDeltaMin < -5
          ? ` · finished ${Math.abs(variance.endDeltaMin)} min early`
          : ""
      : "";

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={`inline-flex items-center gap-0.5 rounded border font-medium ${sizeCls} ${style.bg} ${style.text} ${style.border}`}
              aria-label={desc + endNote}
            />
          }
        >
          {label}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">{desc}</p>
          {endNote && (
            <p className="text-xs text-muted-foreground">{endNote.replace(/^ · /, "")}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
