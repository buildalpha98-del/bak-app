"use client";

import { useState } from "react";
import { Star, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { submitSessionFeedback } from "@/lib/client/feedback-actions";
import type { SessionForFeedback } from "@/lib/client/feedback-actions";

interface FeedbackFormProps {
  session: SessionForFeedback;
  centreId: string;
  onSubmitted?: () => void;
}

function formatDateNice(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function FeedbackForm({ session, centreId, onSubmitted }: FeedbackFormProps) {
  const [rating, setRating] = useState<number>(session.existingRating ?? 0);
  const [comment, setComment] = useState<string>(session.existingComment ?? "");
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isEditing = session.existingRating !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await submitSessionFeedback(session.id, centreId, rating, comment);
      setSubmitted(true);
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="animate-in fade-in duration-300 flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
        <p className="text-sm font-medium text-foreground">Thanks for your feedback!</p>
        <p className="text-xs text-muted-foreground">Your rating has been saved.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Session info header */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{formatDateNice(session.date)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-cyan-50 text-cyan-700 hover:bg-cyan-50">
            {session.sport}
          </Badge>
          <span className="text-xs text-muted-foreground">Coach {session.coach_name}</span>
        </div>
      </div>

      {/* Star rating */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Rating</p>
        <div className="flex items-center gap-1" role="group" aria-label="Session rating">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = (hoveredStar || rating) >= star;
            return (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center transition-transform active:scale-90"
                aria-label={`${star} star${star !== 1 ? "s" : ""}`}
              >
                <Star
                  className={`h-7 w-7 transition-colors ${
                    active
                      ? "fill-amber-400 text-amber-400"
                      : "text-gray-300 hover:text-amber-300"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Comment textarea */}
      <div className="space-y-1">
        <label
          htmlFor={`comment-${session.id}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Comment (optional)
        </label>
        <textarea
          id={`comment-${session.id}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How was the session? Any feedback for our coach?"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 resize-none"
        />
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        disabled={rating === 0 || submitting}
        className="w-full rounded-2xl bg-[#E8712A] text-white hover:bg-[#E8712A]/90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : isEditing ? "Update Feedback" : "Submit Feedback"}
      </Button>
    </form>
  );
}
