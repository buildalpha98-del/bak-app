import Link from "next/link";
import { getRecentFeedback } from "@/lib/feedback/actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Star, MessageSquare } from "lucide-react";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-[#E8712A] text-[#E8712A]"
              : "fill-none text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export async function RecentFeedbackWidget() {
  const { data, error } = await getRecentFeedback(5);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1A1A1A]">
            <MessageSquare className="h-4 w-4 text-[#E8712A]" />
            Recent Feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#666666]">Unable to load feedback data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#1A1A1A]">
          <MessageSquare className="h-4 w-4 text-[#E8712A]" />
          Recent Feedback
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-[#666666]">No feedback received yet.</p>
        ) : (
          <div className="space-y-3">
            {data.map((item) => {
              const isLow = item.rating < 3;
              return (
                <div
                  key={item.id}
                  className={`flex items-start justify-between rounded-lg px-3 py-2 ${
                    isLow ? "bg-red-50" : "bg-[#F5F5F5]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${
                        isLow ? "text-red-700" : "text-[#1A1A1A]"
                      }`}
                    >
                      {item.centre_name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <StarRating rating={item.rating} />
                      {item.sport && (
                        <span className="text-xs text-[#666666]">{item.sport}</span>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 text-xs text-[#666666]">
                    {timeAgo(item.submitted_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4">
          <Link
            href="/ops/feedback"
            className="text-sm font-medium text-[#E8712A] hover:underline"
          >
            View All
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
