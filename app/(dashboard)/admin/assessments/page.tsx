import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAssessmentTemplates } from "@/lib/assessments/actions";
import { getAssessmentsStatusPulse } from "@/lib/assessments/status-pulse-actions";
import { AssessmentListView } from "@/components/assessments/assessment-list-view";
import { AssessmentsStatusPulseStrip } from "@/components/assessments/assessments-status-pulse";
import { LoadError } from "@/components/ui/load-error";

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
      .select("id, name, status")
      .order("start_date", { ascending: false }),
    getAssessmentsStatusPulse(),
  ]);
  const terms = termsResult.data ?? [];
  const activeTermId = terms.find((t) => t.status === "active")?.id ?? null;

  if (templatesResult.error) {
    return (
      <div className="container max-w-6xl py-6">
        <LoadError message={templatesResult.error} />
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
        terms={terms.map((t) => ({ id: t.id, name: t.name }))}
        activeTermId={activeTermId}
        basePath="/admin/assessments"
      />
    </div>
  );
}
