import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getFormTemplates,
  getFormSubmissions,
  getSubmissionCountsByTemplate,
} from "@/lib/forms/actions";
import { getFormsStatusPulse } from "@/lib/forms/status-pulse-actions";
import { FormTemplateList } from "@/components/forms/form-template-list";

export default async function AdminFormsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    templatesRes,
    submissionsRes,
    countsRes,
    pulse,
  ] = await Promise.all([
    getFormTemplates(),
    getFormSubmissions({}),
    getSubmissionCountsByTemplate(),
    getFormsStatusPulse(),
  ]);

  if (templatesRes.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {templatesRes.error}
      </div>
    );
  }

  return (
    <FormTemplateList
      initialTemplates={templatesRes.data ?? []}
      initialSubmissions={submissionsRes.data ?? []}
      submissionCounts={countsRes.data ?? {}}
      pulse={pulse}
      basePath="/admin/forms"
    />
  );
}
