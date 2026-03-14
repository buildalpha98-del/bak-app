import { getLeads } from "@/lib/crm/actions";
import { LeadListView } from "@/components/crm/lead-list-view";

export default async function CrmListPage() {
  const { data, error } = await getLeads();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load leads: {error}
      </div>
    );
  }

  return <LeadListView leads={data ?? []} />;
}
