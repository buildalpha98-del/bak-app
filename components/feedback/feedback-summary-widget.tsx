import { getFeedbackAggregation } from "@/lib/feedback/actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Star, TrendingUp, TrendingDown, MessageSquare } from "lucide-react";

export async function FeedbackSummaryWidget() {
  const { data, error } = await getFeedbackAggregation();

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <MessageSquare className="h-4 w-4 text-primary" />
            Session Feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load feedback data.</p>
        </CardContent>
      </Card>
    );
  }

  const { averageRating, totalCount, last30DaysAvg, prior30DaysAvg, last30DaysCount } = data;
  const trendUp = last30DaysAvg >= prior30DaysAvg;
  const trendDiff = Math.abs(last30DaysAvg - prior30DaysAvg);
  const hasTrend = prior30DaysAvg > 0 && last30DaysCount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" />
          Session Feedback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Average rating */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Star className="h-8 w-8 fill-primary text-primary" />
            <span className="text-3xl font-bold text-foreground">
              {averageRating > 0 ? averageRating.toFixed(1) : "—"}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Average rating</p>
            <p>{totalCount} total {totalCount === 1 ? "response" : "responses"}</p>
          </div>
        </div>

        {/* 30-day trend */}
        <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Last 30 days</p>
            <p>{last30DaysCount} {last30DaysCount === 1 ? "response" : "responses"}</p>
          </div>
          {hasTrend ? (
            <div className={`flex items-center gap-1 text-sm font-medium ${trendUp ? "text-green-600" : "text-red-600"}`}>
              {trendUp ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span>{trendDiff.toFixed(1)}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Not enough data</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
