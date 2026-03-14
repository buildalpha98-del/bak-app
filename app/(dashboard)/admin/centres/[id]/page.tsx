import { notFound } from "next/navigation";
import { getCentreDetail } from "@/lib/centres/actions";
import { CentreDetailView } from "@/components/centres/centre-detail-view";

interface AdminCentreDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCentreDetailPage({
  params,
}: AdminCentreDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getCentreDetail(id);

  if (error || !data) {
    notFound();
  }

  return <CentreDetailView data={data} basePath="/admin/centres" />;
}
