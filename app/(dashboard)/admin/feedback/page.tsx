import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFeedbackList, getFeedbackAggregation } from "@/lib/feedback/actions";
import { AdminFeedbackClient } from "./client";

export default async function AdminFeedbackPage() {
  const supabase = await createSupabaseServer();
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

  const [feedbackResult, aggregationResult] = await Promise.all([
    getFeedbackList(),
    getFeedbackAggregation(),
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
    />
  );
}
