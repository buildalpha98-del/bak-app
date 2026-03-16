import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAssessmentTemplateDetail } from "@/lib/assessments/actions";
import { AssessmentDetailView } from "@/components/assessments/assessment-detail-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OpsAssessmentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await getAssessmentTemplateDetail(id);

  if (!data) notFound();

  return <AssessmentDetailView template={data} basePath="/ops/assessments" />;
}
