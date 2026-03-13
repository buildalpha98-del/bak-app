"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FeedbackListView } from "@/components/feedback/feedback-list-view";
import { Star, TrendingUp, TrendingDown, MessageSquare } from "lucide-react";
import type { FeedbackListItem } from "@/lib/feedback/actions";

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
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= Math.round(rating)
              ? "fill-[#E8712A] text-[#E8712A]"
              : "text-gray-300"
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
          Math.round((aggregation.last30DaysAvg - aggregation.prior30DaysAvg) * 10) / 10
        )
      : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A1A] mb-6">Session Feedback</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#E8712A]/10">
              <Star className="w-5 h-5 text-[#E8712A]" />
            </div>
            <div>
              <p className="text-sm text-[#666666]">Average Rating</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold text-[#1A1A1A]">
                  {aggregation?.averageRating.toFixed(1) ?? "—"}
                </p>
                <StarRating rating={aggregation?.averageRating ?? 0} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#E8712A]/10">
              <MessageSquare className="w-5 h-5 text-[#E8712A]" />
            </div>
            <div>
              <p className="text-sm text-[#666666]">Total Responses</p>
              <p className="text-xl font-semibold text-[#1A1A1A]">
                {aggregation?.totalCount ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#E8712A]/10">
              {trendDirection === "up" ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : trendDirection === "down" ? (
                <TrendingDown className="w-5 h-5 text-red-500" />
              ) : (
                <TrendingUp className="w-5 h-5 text-[#666666]" />
              )}
            </div>
            <div>
              <p className="text-sm text-[#666666]">30-Day Trend</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xl font-semibold text-[#1A1A1A]">
                  {aggregation?.last30DaysAvg.toFixed(1) ?? "—"}
                </p>
                {trendDirection !== "flat" && trendDiff > 0 && (
                  <span
                    className={`text-xs font-medium ${
                      trendDirection === "up" ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {trendDirection === "up" ? "+" : "-"}
                    {trendDiff.toFixed(1)}
                  </span>
                )}
                <span className="text-xs text-[#666666]">
                  ({aggregation?.last30DaysCount ?? 0} responses)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback list */}
      <FeedbackListView initialData={initialFeedback} totalCount={totalCount} />
    </div>
  );
}
