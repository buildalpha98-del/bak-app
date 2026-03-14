import { notFound } from "next/navigation";
import { getLeadDetail } from "@/lib/crm/actions";
import { LeadDetailView } from "@/components/crm/lead-detail-view";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getLeadDetail(id);

  if (error || !data) {
    notFound();
  }

  return (
    <LeadDetailView
      lead={data.lead}
      activities={data.activities}
      basePath="/admin/crm"
    />
  );
}
