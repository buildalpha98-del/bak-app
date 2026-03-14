import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientReports } from "@/lib/client/portal-actions";
import { ClientReports } from "@/components/client/client-reports";

export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const { data, error } = await getClientReports(centreId);

  if (error) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load reports. Please try again later.
        </p>
      </div>
    );
  }

  return <ClientReports reports={data} />;
}
