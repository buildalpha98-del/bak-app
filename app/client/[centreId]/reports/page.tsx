import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientReports } from "@/lib/client/portal-actions";
import { getClientPortalPulse } from "@/lib/client/status-pulse-actions";
import { ClientReports } from "@/components/client/client-reports";
import { ClientPortalPulseStrip } from "@/components/client/client-status-pulse";

export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const [{ data, error }, pulse] = await Promise.all([
    getClientReports(centreId),
    getClientPortalPulse(centreId),
  ]);

  if (error) {
    return (
      <div className="animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
          <a
            href={`/api/client/${centreId}/calendar`}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#0891B2]/30 bg-[#0891B2]/5 px-3 py-2 text-sm font-medium text-[#0891B2] transition-colors hover:bg-[#0891B2]/10"
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

  return (
    <div className="animate-fade-up space-y-6">
      <ClientPortalPulseStrip
        stats={[
          {
            icon: "file-text",
            count: pulse.reportsNewThisWeekCount,
            label: "new this week",
            href: `/client/${centreId}/reports`,
          },
          {
            icon: "calendar-days",
            count: pulse.reportsThisTermCount,
            label: "reports this term",
          },
          {
            icon: "trending-up",
            count: data.length,
            label: "total available",
          },
        ]}
      />
      <ClientReports reports={data} centreId={centreId} />
    </div>
  );
}
