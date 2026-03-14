import { getCrmStaffMembers } from "@/lib/crm/actions";
import { CsvImportView } from "@/components/crm/csv-import-view";

export default async function CrmImportPage() {
  const { data: staffMembers, error } = await getCrmStaffMembers();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load staff: {error}
      </div>
    );
  }

  return <CsvImportView staffMembers={staffMembers ?? []} />;
}
