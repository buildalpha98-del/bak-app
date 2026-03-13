"use client";

import { useEffect, useState } from "react";
import { Star, MessageSquare } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getCentreFeedbackStats,
  getCoachFeedbackStats,
} from "@/lib/feedback/actions";

// ============================================================
// Shared feedback tab for centre and coach detail views
// ============================================================

interface FeedbackItem {
  rating: number;
  comment: string | null;
  submitted_at: string;
  label: string; // coach_name for centre view, centre_name for coach view
}

interface EntityFeedbackTabProps {
  entityType: "centre" | "coach";
  entityId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "size-5" : "size-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sizeClass} ${
            i <= rating
              ? "fill-primary text-primary"
              : "fill-none text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

export function EntityFeedbackTab({
  entityType,
  entityId,
}: EntityFeedbackTabProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    averageRating: number;
    totalCount: number;
    recent: FeedbackItem[];
  } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (entityType === "centre") {
        const { data } = await getCentreFeedbackStats(entityId);
        if (data) {
          setStats({
            averageRating: data.averageRating,
            totalCount: data.totalCount,
            recent: data.recent.map((r) => ({
              ...r,
              label: r.coach_name,
            })),
          });
        }
      } else {
        const { data } = await getCoachFeedbackStats(entityId);
        if (data) {
          setStats({
            averageRating: data.averageRating,
            totalCount: data.totalCount,
            recent: data.recent.map((r) => ({
              ...r,
              label: r.centre_name,
            })),
          });
        }
      }
      setLoading(false);
    }
    load();
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div className="mt-4 flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading feedback...</p>
      </div>
    );
  }

  if (!stats || stats.totalCount === 0) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <MessageSquare className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No feedback received yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Stats Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-foreground">
                {stats.averageRating.toFixed(1)}
              </span>
              <StarRating rating={Math.round(stats.averageRating)} size="md" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-foreground">
              {stats.totalCount}
            </span>
            <span className="ml-2 text-sm text-muted-foreground">
              {stats.totalCount === 1 ? "rating" : "ratings"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.recent.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-start justify-between rounded-lg border p-3 ${
                item.rating <= 2 ? "border-red-200 bg-red-50" : ""
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StarRating rating={item.rating} />
                  {item.rating <= 2 && (
                    <Badge variant="destructive" className="text-xs">
                      Low
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {entityType === "centre" ? "Coach" : "Centre"}:{" "}
                  <span className="font-medium text-foreground">
                    {item.label}
                  </span>
                </p>
                {item.comment && (
                  <p className="text-sm text-foreground">{item.comment}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(item.submitted_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
