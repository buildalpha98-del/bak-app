import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocuments, getCategoryCounts } from "@/lib/documents/actions";
import { getDocumentsStatusPulse } from "@/lib/documents/status-pulse-actions";
import { DocumentHub } from "@/components/documents/document-hub";

export default async function AdminDocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [docsResult, countsResult, pulse] = await Promise.all([
    getDocuments(),
    getCategoryCounts(),
    getDocumentsStatusPulse(),
  ]);

  const firstError = docsResult.error || countsResult.error;
  if (firstError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <DocumentHub
      initialDocuments={docsResult.data ?? []}
      categoryCounts={countsResult.data ?? {}}
      userRole="admin"
      pulse={pulse}
      basePath="/admin/documents"
    />
  );
}
