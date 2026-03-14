import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCoachAvailableTemplates,
  getCoachSubmissions,
} from "@/lib/forms/actions";
import { CoachFormsView } from "@/components/forms/coach-forms-view";

export default async function CoachFormsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get coach display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const coachName = profile?.full_name ?? user.email ?? "Coach";

  const [templatesResult, submissionsResult] = await Promise.all([
    getCoachAvailableTemplates(),
    getCoachSubmissions(),
  ]);

  const firstError = templatesResult.error || submissionsResult.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <CoachFormsView
      templates={templatesResult.data ?? []}
      submissions={submissionsResult.data ?? []}
      coachName={coachName}
    />
  );
}
