"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface FeedbackFormProps {
  feedbackId: string;
  token: string;
  sessionInfo: {
    date: string;
    sport: string;
    coach_name: string;
    centre_name: string;
  };
}

export function FeedbackForm({ feedbackId, token, sessionInfo }: FeedbackFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayRating = hoveredStar || rating;

  const ratingLabels: Record<number, string> = {
    1: "Poor",
    2: "Below average",
    3: "Good",
    4: "Very good",
    5: "Excellent",
  };

  async function handleSubmit() {
    if (rating === 0) {
      setError("Please select a rating before submitting.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          rating,
          comment: comment.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          Thank you for your feedback!
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your rating of {rating}/5 has been recorded. We appreciate you taking
          the time to share your experience.
        </p>
        <div className="mt-4 flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`h-6 w-6 ${
                star <= rating
                  ? "fill-primary text-primary"
                  : "text-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card shadow-sm">
      {/* Session details */}
      <div className="border-b border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Session Feedback
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How was your recent coaching session?
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Sport</span>
            <p className="font-medium text-foreground">{sessionInfo.sport}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Date</span>
            <p className="font-medium text-foreground">
              {formatDate(sessionInfo.date)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Coach</span>
            <p className="font-medium text-foreground">
              {sessionInfo.coach_name}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Centre</span>
            <p className="font-medium text-foreground">
              {sessionInfo.centre_name}
            </p>
          </div>
        </div>
      </div>

      {/* Rating */}
      <div className="border-b border-border p-6">
        <label className="block text-sm font-medium text-foreground">
          Overall rating
        </label>
        <div className="mt-3 flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              className="rounded-md p-1 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
            >
              <Star
                className={`h-10 w-10 transition-colors ${
                  star <= displayRating
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40 hover:text-muted-foreground/60"
                }`}
              />
            </button>
          ))}
        </div>
        {displayRating > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {ratingLabels[displayRating]}
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="border-b border-border p-6">
        <label
          htmlFor="feedback-comment"
          className="block text-sm font-medium text-foreground"
        >
          Comments
        </label>
        <textarea
          id="feedback-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any additional comments? (optional)"
          rows={3}
          className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={1000}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="p-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || rating === 0}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Feedback"}
        </button>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
