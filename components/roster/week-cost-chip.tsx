"use client";

import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DollarSign, AlertTriangle } from "lucide-react";
import { getWeekCostProjection } from "@/lib/roster/cost-actions";
import type { CostProjection } from "@/lib/utils/roster/cost-projection";

function fmtAud(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

interface Props {
  weekStart: string;
}

export function WeekCostChip({ weekStart }: Props) {
  const [data, setData] = useState<CostProjection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWeekCostProjection(weekStart)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
        <DollarSign className="size-3.5" />
        Loading…
      </div>
    );
  }

  if (!data || (data.pricedSessions === 0 && data.unpricedSessions === 0)) {
    return null;
  }

  const hasUnpriced = data.unpricedSessions > 0;
  const topRows = data.byCoach.slice(0, 5);

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex cursor-default items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs"
              aria-label={`Projected wage cost ${fmtAud(data.totalCost)} this week`}
            />
          }
        >
          <DollarSign className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">
            ≈ {fmtAud(data.totalCost)}
          </span>
          <span className="text-muted-foreground">
            · {data.totalHours.toFixed(1)}h
          </span>
          {hasUnpriced && (
            <AlertTriangle
              className="ml-1 size-3.5 text-amber-500"
              aria-label={`${data.unpricedSessions} unpriced session${
                data.unpricedSessions === 1 ? "" : "s"
              }`}
            />
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-2 text-xs">
          <div className="font-medium">Wage cost — this week</div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>Total: {fmtAud(data.totalCost)} ({data.totalHours.toFixed(1)}h)</div>
            <div>{data.pricedSessions} priced session{data.pricedSessions === 1 ? "" : "s"}</div>
            {data.unpricedSessions > 0 && (
              <div className="text-amber-600">
                {data.unpricedSessions} unpriced (no rate on file)
              </div>
            )}
            {data.unassignedSessions > 0 && (
              <div>
                {data.unassignedSessions} unassigned (open shift{data.unassignedSessions === 1 ? "" : "s"})
              </div>
            )}
          </div>
          {topRows.length > 0 && (
            <div className="border-t pt-1.5 space-y-0.5">
              <div className="font-medium text-foreground">By coach</div>
              {topRows.map((row) => (
                <div
                  key={row.coachId}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{row.coachName}</span>
                  <span className="text-muted-foreground ml-2 shrink-0">
                    {fmtAud(row.cost)} · {row.hours.toFixed(1)}h
                  </span>
                </div>
              ))}
              {data.byCoach.length > topRows.length && (
                <div className="text-muted-foreground italic">
                  +{data.byCoach.length - topRows.length} more
                </div>
              )}
            </div>
          )}
          <div className="border-t pt-1.5 text-muted-foreground italic">
            Cancelled sessions excluded.
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
