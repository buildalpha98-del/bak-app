import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAssessmentTemplates } from "@/lib/assessments/actions";
import { getAssessmentsStatusPulse } from "@/lib/assessments/status-pulse-actions";
import { AssessmentListView } from "@/components/assessments/assessment-list-view";
import { AssessmentsStatusPulseStrip } from "@/components/assessments/assessments-status-pulse";

export const metadata = {
  title: "Assessments | Build Alpha Kids",
};

export default async function AdminAssessmentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const [templatesResult, centresResult, termsResult, pulse] = await Promise.all([
    getAssessmentTemplates(),
    admin.from("centres").select("id, name").order("name"),
    admin
      .from("terms")
      .select("id, name")
      .order("start_date", { ascending: false }),
    getAssessmentsStatusPulse(),
  ]);

  if (templatesResult.error) {
    return (
      <div className="container max-w-6xl py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {templatesResult.error}
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl space-y-6 py-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
        <p className="text-sm text-muted-foreground">
          {templatesResult.data.length} template
          {templatesResult.data.length === 1 ? "" : "s"} across all sports and
          age groups.
        </p>
      </div>

      <AssessmentsStatusPulseStrip pulse={pulse} basePath="/admin/assessments" />

      <AssessmentListView
        templates={templatesResult.data}
        centres={centresResult.data ?? []}
        terms={termsResult.data ?? []}
        basePath="/admin/assessments"
      />
    </div>
  );
}
