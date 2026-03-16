import { notFound } from "next/navigation";
import { getReportDetail } from "@/lib/reports/actions";
import { ReportPreview } from "@/components/reports/report-preview";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminReportDetailPage({ params }: Props) {
  const { id } = await params;
  const { data, error } = await getReportDetail(id);
  if (error || !data) notFound();
  return <ReportPreview report={data} />;
}
