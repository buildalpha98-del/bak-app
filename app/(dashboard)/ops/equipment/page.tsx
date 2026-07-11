import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getKits,
  getInventoryItems,
  getCentresSimple,
} from "@/lib/equipment/actions";
import { getEquipmentStatusPulse } from "@/lib/equipment/status-pulse-actions";
import { EquipmentPageTabs } from "@/components/equipment/equipment-page-tabs";
import { LoadError } from "@/components/ui/load-error";

export default async function OpsEquipmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [kitsResult, inventoryResult, pulse, centresResult] = await Promise.all([
    getKits(),
    getInventoryItems(),
    getEquipmentStatusPulse(),
    getCentresSimple(),
  ]);

  if (kitsResult.error) {
    return (
      <LoadError message={kitsResult.error} />
    );
  }

  return (
    <EquipmentPageTabs
      initialKits={kitsResult.data ?? []}
      initialInventory={inventoryResult.data ?? []}
      userRole="ops"
      basePath="/ops/equipment"
      pulse={pulse}
      centres={centresResult.data ?? []}
    />
  );
}
