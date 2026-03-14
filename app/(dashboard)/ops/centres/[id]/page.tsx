import { notFound } from "next/navigation";
import { getCentreDetail } from "@/lib/centres/actions";
import { CentreDetailView } from "@/components/centres/centre-detail-view";

interface OpsCentreDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsCentreDetailPage({
  params,
}: OpsCentreDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getCentreDetail(id);

  if (error || !data) {
    notFound();
  }

  return <CentreDetailView data={data} basePath="/ops/centres" />;
}
