import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientDashboard } from "@/lib/client/portal-actions";
import { getClientStatusPulse } from "@/lib/client/status-pulse-actions";
import { ClientDashboard } from "@/components/client/client-dashboard";

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const [{ data, error }, pulse] = await Promise.all([
    getClientDashboard(centreId),
    getClientStatusPulse(centreId),
  ]);

  if (error || !data) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load dashboard data. Please try again later.
        </p>
      </div>
    );
  }

  return <ClientDashboard data={data} centreId={centreId} pulse={pulse} />;
}
