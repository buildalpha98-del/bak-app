import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoachAssignedKits } from "@/lib/equipment/actions";
import { CoachEquipmentView } from "@/components/equipment/coach-equipment-view";

export default async function CoachEquipmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await getCoachAssignedKits();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return <CoachEquipmentView initialKits={data ?? []} />;
}
