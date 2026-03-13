"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import type { RecentRating } from "@/lib/ops/actions";

interface RecentRatingsWidgetProps {
  ratings: RecentRating[];
  onRefresh: () => void;
}

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-4 ${
            i <= rating
              ? "fill-primary text-primary"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function RecentRatingsWidget({
  ratings,
}: RecentRatingsWidgetProps) {
  return (
    <WidgetWrapper title="Recent Ratings" icon={Star} count={ratings.length}>
      {ratings.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No feedback received yet
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {ratings.map((r) => (
            <div
              key={r.id}
              className={`py-3 first:pt-0 -mx-2 px-2 rounded-lg ${
                r.rating < 3
                  ? "bg-destructive/5 border border-destructive/15"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {r.centre_name}
                  </p>
                  {r.sport && (
                    <p className="text-xs text-muted-foreground">{r.sport}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDate(r.submitted_at)}
                </span>
              </div>
              <div className="mt-1.5">
                <StarRating rating={r.rating} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <Link
          href="/ops/feedback"
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors duration-200"
        >
          View All
        </Link>
      </div>
    </WidgetWrapper>
  );
}
