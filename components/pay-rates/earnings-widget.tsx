"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  Calendar,
} from "lucide-react";
import { formatTime12 } from "@/lib/utils/roster";
import { formatPeriod, formatAmount } from "@/lib/utils/payRates";
import type { CoachEarningsSummary } from "@/lib/pay-rates/actions";

// ============================================================
// Props
// ============================================================

interface EarningsWidgetProps {
  earnings: CoachEarningsSummary | null;
}

// ============================================================
// Component
// ============================================================

export function EarningsWidget({ earnings }: EarningsWidgetProps) {
  const [expanded, setExpanded] = useState(false);

  if (!earnings) return null;

  const periodLabel = formatPeriod(
    new Date(earnings.periodStart),
    new Date(earnings.periodEnd)
  );

  return (
    <Card
      className="cursor-pointer card-hover"
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Summary row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--brand-orange-light)]">
              <DollarSign className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Earnings this period</p>
              <p className="text-xl font-bold text-foreground">
                {formatAmount(earnings.totalEarnings)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {periodLabel}
            </Badge>
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground/60" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground/60" />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <Hash className="size-3.5 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">
              {earnings.sessionCount} session
              {earnings.sessionCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">
              {earnings.totalHours} hrs
            </span>
          </div>
        </div>

        {/* Expanded — itemised list */}
        {expanded && earnings.sessions.length > 0 && (
          <div
            className="space-y-2 pt-2 border-t"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Session Breakdown
            </p>

            {earnings.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {s.sport} — {s.centre_name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                    <span className="flex items-center gap-0.5">
                      <Calendar className="size-2.5" />
                      {new Date(s.date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span>{formatTime12(s.time)}</span>
                    <span>{s.duration_minutes} min</span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground shrink-0 ml-3">
                  {formatAmount(s.amount)}
                </p>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground">Total</p>
              <p className="text-sm font-bold text-primary">
                {formatAmount(earnings.totalEarnings)}
              </p>
            </div>
          </div>
        )}

        {expanded && earnings.sessions.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center py-2">
            No completed sessions in this period yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
