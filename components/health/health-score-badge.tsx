"use client";

import { cn } from "@/lib/utils";

interface HealthScoreBadgeProps {
  score: number | null;
  status: string | null;
  size?: "sm" | "md";
}

const STATUS_COLOURS: Record<string, string> = {
  green: "bg-[#22C55E]",
  amber: "bg-[#F59E0B]",
  red: "bg-[#EF4444]",
};

const SIZE_MAP = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
} as const;

export function HealthScoreBadge({
  score,
  status,
  size = "sm",
}: HealthScoreBadgeProps) {
  if (score === null || status === null) {
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium",
          SIZE_MAP[size]
        )}
      >
        &mdash;
      </div>
    );
  }

  const colourClass = STATUS_COLOURS[status] ?? "bg-muted";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white",
        colourClass,
        SIZE_MAP[size]
      )}
      title={`Health score: ${score}`}
    >
      {score}
    </div>
  );
}
