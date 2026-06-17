import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getFeedbackList,
  getFeedbackAggregation,
  getFeedbackSentimentDistribution,
} from "@/lib/feedback/actions";
import { getFeedbackStatusPulse } from "@/lib/feedback/status-pulse-actions";
import { AdminFeedbackClient } from "./client";

export default async function AdminFeedbackPage() {
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

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const [
    feedbackResult,
    aggregationResult,
    pulse,
    sentimentResult,
    coachesResult,
    centresResult,
  ] = await Promise.all([
    getFeedbackList(),
    getFeedbackAggregation(),
    getFeedbackStatusPulse(),
    getFeedbackSentimentDistribution(),
    supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("centres")
      .select("id, name")
      .in("contract_status", ["active", "trial"])
      .order("name"),
  ]);

  const firstError = feedbackResult.error || aggregationResult.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <AdminFeedbackClient
      initialFeedback={feedbackResult.data ?? []}
      totalCount={feedbackResult.total}
      aggregation={aggregationResult.data ?? null}
      pulse={pulse}
      sentimentDistribution={sentimentResult.data}
      coaches={
        (coachesResult.data ?? []).map((c) => ({
          id: c.id as string,
          name: c.name as string,
        }))
      }
      centres={
        (centresResult.data ?? []).map((c) => ({
          id: c.id as string,
          name: c.name as string,
        }))
      }
    />
  );
}
