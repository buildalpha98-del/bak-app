"use client";

import { FeedbackListView } from "@/components/feedback/feedback-list-view";
import { FeedbackStatusPulseStrip } from "@/components/feedback/feedback-status-pulse";
import {
  SentimentDistribution,
  type SentimentDistributionData,
} from "@/components/feedback/sentiment-distribution";
import { Star, TrendingUp, TrendingDown, MessageSquare } from "lucide-react";
import type { FeedbackListItem } from "@/lib/feedback/actions";
import type { FeedbackStatusPulse } from "@/lib/feedback/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface AdminFeedbackClientProps {
  initialFeedback: FeedbackListItem[];
  totalCount: number;
  aggregation: {
    averageRating: number;
    totalCount: number;
    last30DaysAvg: number;
    prior30DaysAvg: number;
    last30DaysCount: number;
  } | null;
  pulse: FeedbackStatusPulse;
  sentimentDistribution: SentimentDistributionData;
  coaches: { id: string; name: string }[];
  centres: { id: string; name: string }[];
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`size-4 ${
            star <= Math.round(rating)
              ? "fill-[#E8712A] text-[#E8712A]"
              : "text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

export function AdminFeedbackClient({
  initialFeedback,
  totalCount,
  aggregation,
  pulse,
  sentimentDistribution,
  coaches,
  centres,
}: AdminFeedbackClientProps) {
  const trendDirection =
    aggregation && aggregation.last30DaysAvg > aggregation.prior30DaysAvg
      ? "up"
      : aggregation && aggregation.last30DaysAvg < aggregation.prior30DaysAvg
        ? "down"
        : "flat";

  const trendDiff =
    aggregation
      ? Math.abs(
          Math.round(
            (aggregation.last30DaysAvg - aggregation.prior30DaysAvg) * 10
          ) / 10
        )
      : 0;

  const tickedTotal = useCountUp(aggregation?.totalCount ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Session feedback
          </h1>
          <p className="text-sm text-muted-foreground">
            {aggregation?.totalCount ?? 0} total{" "}
            {(aggregation?.totalCount ?? 0) === 1 ? "response" : "responses"}{" "}
            tracked
          </p>
        </div>
      </div>

      {/* Pulse strip */}
      <FeedbackStatusPulseStrip basePath="/admin/feedback" pulse={pulse} />

      {/* Stats row + sentiment distribution */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-background p-5 transition hover:shadow-md">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="size-4 text-[#E8712A]" />
            <span>Average rating</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {aggregation?.averageRating.toFixed(1) ?? "—"}
            </p>
            <StarRating rating={aggregation?.averageRating ?? 0} />
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-5 transition hover:shadow-md">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="size-4 text-[#E8712A]" />
            <span>Total responses</span>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
            {tickedTotal}
          </p>
        </div>

        <div className="rounded-2xl border bg-background p-5 transition hover:shadow-md">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {trendDirection === "up" ? (
              <TrendingUp className="size-4 text-emerald-600" />
            ) : trendDirection === "down" ? (
              <TrendingDown className="size-4 text-red-500" />
            ) : (
              <TrendingUp className="size-4 text-muted-foreground" />
            )}
            <span>30-day trend</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {aggregation?.last30DaysAvg.toFixed(1) ?? "—"}
            </p>
            {trendDirection !== "flat" && trendDiff > 0 && (
              <span
                className={`text-xs font-medium ${
                  trendDirection === "up" ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {trendDirection === "up" ? "+" : "-"}
                {trendDiff.toFixed(1)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              ({aggregation?.last30DaysCount ?? 0} responses)
            </span>
          </div>
        </div>

        <SentimentDistribution distribution={sentimentDistribution} />
      </div>

      {/* Feedback list */}
      <FeedbackListView
        initialData={initialFeedback}
        totalCount={totalCount}
        basePath="/admin/feedback"
        coaches={coaches}
        centres={centres}
        showBulk
      />
    </div>
  );
}
