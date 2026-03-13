import { getFeedbackByToken } from "@/lib/feedback/actions";
import { Star } from "lucide-react";
import { FeedbackForm } from "./feedback-form";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { data } = await getFeedbackByToken(token);

  return (
    <div className="min-h-screen bg-secondary">
      {/* Brand header */}
      <div className="w-full bg-primary py-4">
        <div className="mx-auto max-w-lg px-4">
          <h1 className="text-center text-lg font-semibold text-white">
            Build Alpha Kids
          </h1>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-8">
        {/* Invalid / expired link */}
        {!data && (
          <div className="rounded-lg bg-card p-8 text-center shadow-sm">
            <p className="text-foreground text-lg font-medium">
              Invalid or expired feedback link
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              This link may have already been used or is no longer valid.
            </p>
          </div>
        )}

        {/* Already submitted */}
        {data && data.submitted_at && (
          <div className="rounded-lg bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
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
            <p className="text-foreground text-lg font-medium">
              Thank you! Your feedback has already been submitted.
            </p>
            <div className="mt-4 flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-6 w-6 ${
                    star <= (data.rating ?? 0)
                      ? "fill-primary text-primary"
                      : "text-muted-foreground/40"
                  }`}
                />
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {data.rating}/5
              </span>
            </div>
          </div>
        )}

        {/* Pending — show form */}
        {data && !data.submitted_at && (
          <FeedbackForm
            feedbackId={data.id}
            token={token}
            sessionInfo={data.session}
          />
        )}
      </main>
    </div>
  );
}
