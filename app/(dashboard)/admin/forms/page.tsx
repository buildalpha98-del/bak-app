import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFormTemplates } from "@/lib/forms/actions";
import { FormTemplateList } from "@/components/forms/form-template-list";

export default async function AdminFormsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await getFormTemplates();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <FormTemplateList
      initialTemplates={data ?? []}
      basePath="/admin/forms"
    />
  );
}
