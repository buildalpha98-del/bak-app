import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getFormTemplates,
  getFormSubmissions,
  getSubmissionCountsByTemplate,
} from "@/lib/forms/actions";
import { getFormsStatusPulse } from "@/lib/forms/status-pulse-actions";
import { FormTemplateList } from "@/components/forms/form-template-list";
import { LoadError } from "@/components/ui/load-error";

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
      <LoadError message={templatesRes.error} />
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
