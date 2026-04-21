import { getGrantOverview, listApplications, listGrants } from "@/lib/grants/actions";
import { getCentreList } from "@/lib/centres/actions";
import { GrantsDashboard } from "@/components/grants/grants-dashboard";

export default async function AdminGrantsPage() {
  const [{ data: overview, error: overviewErr }, { data: applications }, { data: grants }, { data: centreList }] =
    await Promise.all([
      getGrantOverview(),
      listApplications(),
      listGrants(),
      getCentreList(),
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
    <GrantsDashboard
      overview={overview}
      applications={applications ?? []}
      grants={grants ?? []}
      schools={schools.map((s) => ({ id: s.id, name: s.name, type: s.type }))}
    />
  );
}
