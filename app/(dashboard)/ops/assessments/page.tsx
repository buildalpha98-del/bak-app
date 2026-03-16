import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAssessmentTemplates } from "@/lib/assessments/actions";
import { AssessmentListView } from "@/components/assessments/assessment-list-view";

export default async function OpsAssessmentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const [templatesResult, centresResult, termsResult] = await Promise.all([
    getAssessmentTemplates(),
    admin.from("centres").select("id, name").order("name"),
    admin
      .from("terms")
      .select("id, name")
      .order("start_date", { ascending: false }),
  ]);

  if (templatesResult.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {templatesResult.error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 animate-fade-up">
      <div className="mb-6">
        <h1 className="text-lg font-semibold font-heading text-foreground">
          Assessments
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage skill assessment templates for coaching sessions.
        </p>
      </div>

      <AssessmentListView
        templates={templatesResult.data}
        centres={centresResult.data ?? []}
        terms={termsResult.data ?? []}
        basePath="/ops/assessments"
      />
    </div>
  );
}
