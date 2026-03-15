import { getStaffList } from "@/lib/staff/actions";
import { StaffListView } from "@/components/staff/staff-list-view";

export default async function OpsStaffPage() {
  const { data, error } = await getStaffList();

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Staff</h1>
        <p className="mt-2 text-red-600">Failed to load staff: {error}</p>
      </div>
    );
  }

  return <StaffListView initialData={data ?? []} />;
}
