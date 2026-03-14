import { notFound } from "next/navigation";
import {
  getTermDetail,
  getTermTemplates,
  getCentresForSelect,
  getActiveCoaches,
} from "@/lib/terms/actions";
import { TemplateBuilder } from "@/components/roster/template-builder";

interface OpsTemplatePageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsTemplatePage({
  params,
}: OpsTemplatePageProps) {
  const { id } = await params;

  const [termRes, templatesRes, centresRes, coachesRes] = await Promise.all([
    getTermDetail(id),
    getTermTemplates(id),
    getCentresForSelect(),
    getActiveCoaches(),
  ]);

  if (termRes.error || !termRes.data) {
    notFound();
  }

  return (
    <TemplateBuilder
      term={termRes.data}
      templates={templatesRes.data ?? []}
      centres={centresRes.data ?? []}
      coaches={coachesRes.data ?? []}
      basePath="/ops/roster/terms"
    />
  );
}
