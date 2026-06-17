import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFeedbackList, getFeedbackAggregation } from "@/lib/feedback/actions";
import { getFeedbackStatusPulse } from "@/lib/feedback/status-pulse-actions";
import { FeedbackStatusPulseStrip } from "@/components/feedback/feedback-status-pulse";
import { OpsFeedbackClient } from "./client";

export default async function OpsFeedbackPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "ops" && profile.role !== "admin")) {
    redirect("/");
  }

  // Pulse fan-out parity with /admin/feedback.
  const [feedbackResult, aggregationResult, pulse] = await Promise.all([
    getFeedbackList(),
    getFeedbackAggregation(),
    getFeedbackStatusPulse(),
  ]);

  const firstError = feedbackResult.error || aggregationResult.error;
  if (firstError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <FeedbackStatusPulseStrip pulse={pulse} basePath="/ops/feedback" />
      <OpsFeedbackClient
        initialFeedback={feedbackResult.data ?? []}
        totalCount={feedbackResult.total}
        aggregation={aggregationResult.data ?? null}
        userRole={profile.role}
      />
    </div>
  );
}
