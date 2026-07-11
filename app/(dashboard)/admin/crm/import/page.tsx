import { getCrmStaffMembers } from "@/lib/crm/actions";
import { CsvImportView } from "@/components/crm/csv-import-view";
import { LoadError } from "@/components/ui/load-error";

export default async function CrmImportPage() {
  const { data: staffMembers, error } = await getCrmStaffMembers();

  if (error) {
    return (
      <LoadError message={`Failed to load staff: ${error}`} />
    );
  }

  return <CsvImportView staffMembers={staffMembers ?? []} />;
}
