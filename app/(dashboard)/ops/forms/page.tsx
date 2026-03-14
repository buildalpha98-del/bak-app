import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFormSubmissions } from "@/lib/forms/actions";
import { SubmissionList } from "@/components/forms/submission-list";

export default async function OpsFormsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await getFormSubmissions({});

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <SubmissionList
      initialSubmissions={data ?? []}
      userRole="ops"
    />
  );
}
