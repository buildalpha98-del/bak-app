import { getLeads } from "@/lib/crm/actions";
import { LeadListView } from "@/components/crm/lead-list-view";
import { LoadError } from "@/components/ui/load-error";

export default async function CrmListPage() {
  const { data, error } = await getLeads();

  if (error) {
    return (
      <LoadError message={`Failed to load leads: ${error}`} />
    );
  }

  return <LeadListView leads={data ?? []} />;
}
