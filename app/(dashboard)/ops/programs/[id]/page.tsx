import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getProgramDetail,
  getProgramVersionHistory,
  getProgramUsageStats,
} from "@/lib/programs/actions";
import { ProgramDetailView } from "@/components/programs/program-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OpsProgramDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [programResult, versionsResult, usageResult] = await Promise.all([
    getProgramDetail(id),
    getProgramVersionHistory(id),
    getProgramUsageStats(id),
  ]);

  if (!programResult.data) notFound();

  return (
    <ProgramDetailView
      program={programResult.data}
      versions={versionsResult.data ?? []}
      usage={usageResult.data ?? { sessionCount: 0, centresUsed: [], lastUsedAt: null }}
      basePath="/ops/programs"
    />
  );
}
