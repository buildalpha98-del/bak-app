import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
          <a
            href={`/api/client/${centreId}/calendar`}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100 transition-colors"
          >
            <Calendar className="h-4 w-4" />
            Sync Calendar
          </a>
        </div>
        <p className="mt-4 text-muted-foreground">
          Unable to load reports. Please try again later.
        </p>
      </div>
    );
  }

  return <ClientReports reports={data} centreId={centreId} />;
}
