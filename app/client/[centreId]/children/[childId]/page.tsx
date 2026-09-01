import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getChildDetail } from "@/lib/client/portal-actions";
import { ChildDetailView } from "@/components/client/child-detail-view";

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ centreId: string; childId: string }>;
}) {
  const { centreId, childId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  // Multi-campus: authorisation comes from the join table, not the
  // default centre. Bounce only when genuinely unauthorised.
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);

  const { data, error } = await getChildDetail(childId, centreId);

  if (error || !data) {
    redirect(`/client/${centreId}/children`);
  }

  return (
    <ChildDetailView
      child={data}
      centreId={centreId}
      isSchool={clientUser.centre_type === "school"}
    />
  );
}
