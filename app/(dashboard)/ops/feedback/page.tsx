import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFeedbackList, getFeedbackAggregation } from "@/lib/feedback/actions";
import { OpsFeedbackClient } from "./client";

export default async function OpsFeedbackPage() {
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

  if (!profile || (profile.role !== "ops" && profile.role !== "admin")) {
    redirect("/");
  }

  const [feedbackResult, aggregationResult] = await Promise.all([
    getFeedbackList(),
    getFeedbackAggregation(),
  ]);

  return (
    <OpsFeedbackClient
      initialFeedback={feedbackResult.data ?? []}
      totalCount={feedbackResult.total}
      aggregation={aggregationResult.data ?? null}
      userRole={profile.role}
    />
  );
}
