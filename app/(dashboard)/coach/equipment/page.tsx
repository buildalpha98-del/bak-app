import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoachAssignedKits } from "@/lib/equipment/actions";
import { getCoachEquipmentPulse } from "@/lib/coach/page-pulses";
import { CoachEquipmentView } from "@/components/equipment/coach-equipment-view";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";

export default async function CoachEquipmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data, error }, pulse] = await Promise.all([
    getCoachAssignedKits(),
    getCoachEquipmentPulse(user.id),
  ]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <CoachPulseStrip
        items={[
          {
            icon: "package",
            count: pulse.kitsAssignedCount,
            label:
              pulse.kitsAssignedCount === 1
                ? "kit assigned"
                : "kits assigned",
          },
          {
            icon: "alert-triangle",
            count: pulse.issuesOpenCount,
            label: pulse.issuesOpenCount === 1 ? "issue open" : "issues open",
            accent: true,
          },
        ]}
      />
      <CoachEquipmentView initialKits={data ?? []} />
    </div>
  );
}
