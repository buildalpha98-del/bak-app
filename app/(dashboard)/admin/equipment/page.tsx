import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getKits } from "@/lib/equipment/actions";
import { EquipmentList } from "@/components/equipment/equipment-list";

export default async function AdminEquipmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await getKits();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <EquipmentList
      initialKits={data ?? []}
      userRole="admin"
      basePath="/admin/equipment"
    />
  );
}
