import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getLinkedCentresForProgramme,
  getProgramDetail,
  getProgramUsageStats,
  getProgramVersionHistory,
} from "@/lib/programs/actions";
import { getProgramFeedbackSummary } from "@/lib/programs/feedback-actions";
import { ProgramDetailView } from "@/components/programs/program-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminProgramDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    programResult,
    versionsResult,
    usageResult,
    linkedCentresResult,
    feedbackResult,
  ] = await Promise.all([
    getProgramDetail(id),
    getProgramVersionHistory(id),
    getProgramUsageStats(id),
    getLinkedCentresForProgramme(id),
    getProgramFeedbackSummary(id),
  ]);

  if (!programResult.data) notFound();

  return (
    <ProgramDetailView
      program={programResult.data}
      versions={versionsResult.data ?? []}
      usage={
        usageResult.data ?? { sessionCount: 0, centresUsed: [], lastUsedAt: null }
      }
      linkedCentres={linkedCentresResult.data ?? []}
      feedbackSummary={feedbackResult.data}
      basePath="/admin/programs"
    />
  );
}
