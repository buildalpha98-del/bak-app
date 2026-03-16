import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getKits, getInventoryItems } from "@/lib/equipment/actions";
import { EquipmentPageTabs } from "@/components/equipment/equipment-page-tabs";

export default async function AdminEquipmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [kitsResult, inventoryResult] = await Promise.all([
    getKits(),
    getInventoryItems(),
  ]);

  if (kitsResult.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {kitsResult.error}
      </div>
    );
  }

  return (
    <EquipmentPageTabs
      initialKits={kitsResult.data ?? []}
      initialInventory={inventoryResult.data ?? []}
      userRole="admin"
      basePath="/admin/equipment"
    />
  );
}
