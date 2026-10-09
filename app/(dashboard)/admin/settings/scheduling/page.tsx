import { getSchedulingPreferences } from "@/lib/scheduling/actions";
import { getRosterableStaff, getCentresForSelect } from "@/lib/terms/actions";
import { SchedulingPreferencesView } from "./scheduling-preferences-view";

export default async function SchedulingPreferencesPage() {
  const [preferences, coachesResult, centresResult] = await Promise.all([
    getSchedulingPreferences(),
    getRosterableStaff(),
    getCentresForSelect(),
  ]);

  return (
    <SchedulingPreferencesView
      initialPreferences={preferences}
      coaches={coachesResult.data ?? []}
      centres={centresResult.data ?? []}
    />
  );
}
