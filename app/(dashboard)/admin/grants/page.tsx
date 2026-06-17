import { getGrantOverview, listApplications, listGrants } from "@/lib/grants/actions";
import { getGrantsStatusPulse } from "@/lib/grants/status-pulse-actions";
import { getCentreList } from "@/lib/centres/actions";
import { GrantsDashboard } from "@/components/grants/grants-dashboard";
import { GrantsStatusPulseStrip } from "@/components/grants/grants-status-pulse";

export default async function AdminGrantsPage() {
  const [
    { data: overview, error: overviewErr },
    { data: applications },
    { data: grants },
    { data: centreList },
    pulse,
  ] = await Promise.all([
    getGrantOverview(),
    listApplications(),
    listGrants(),
    getCentreList(),
    getGrantsStatusPulse(),
  ]);

  if (overviewErr || !overview) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{overviewErr ?? "Failed to load grants overview."}</p>
      </div>
    );
  }

  // Filter centres to schools only
  const schools = (centreList ?? []).filter((c) => c.type === "school");

  return (
    <div className="space-y-6 animate-fade-up">
      <GrantsStatusPulseStrip pulse={pulse} basePath="/admin/grants" />
      <GrantsDashboard
        overview={overview}
        applications={applications ?? []}
        grants={grants ?? []}
        schools={schools.map((s) => ({ id: s.id, name: s.name, type: s.type }))}
      />
    </div>
  );
}
