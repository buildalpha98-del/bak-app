import { redirect } from "next/navigation";
import { getLeadDetail } from "@/lib/crm/actions";
import { LeadDetailView } from "@/components/crm/lead-detail-view";

export default async function OpsLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getLeadDetail(id);

  if (error || !data) {
    redirect("/ops/crm");
  }

  return (
    <div className="animate-fade-up">
      <LeadDetailView
        lead={data.lead}
        activities={data.activities}
        basePath="/ops/crm"
      />
    </div>
  );
}
