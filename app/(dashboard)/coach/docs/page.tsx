import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocuments, getCategoryCounts } from "@/lib/documents/actions";
import { getDocumentsStatusPulse } from "@/lib/documents/status-pulse-actions";
import { DocumentHub } from "@/components/documents/document-hub";
import { LoadError } from "@/components/ui/load-error";

export default async function CoachDocsPage() {
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
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  return (
    <DocumentHub
      initialDocuments={docsResult.data ?? []}
      categoryCounts={countsResult.data ?? {}}
      userRole="coach"
      pulse={pulse}
      basePath="/coach/docs"
    />
  );
}
