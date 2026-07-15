import { RosterPage } from "@/components/roster/roster-page";
import { getSessionsForWeek } from "@/lib/sessions/actions";
import {
  getCentresForSelect,
  getActiveCoaches,
  getActiveTerm,
} from "@/lib/terms/actions";
import { getSessionCertWarningsForWeek } from "@/lib/roster/cert-warnings-actions";
import {
  getRosterStatusPulse,
  getLatestSchedulingRunForWeek,
} from "@/lib/roster/status-pulse-actions";
import { getRegions } from "@/lib/regions/actions";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mondayOfIso } from "@/lib/utils/roster";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { LoadError } from "@/components/ui/load-error";

interface AdminRosterPageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function AdminRosterPage({
  searchParams,
}: AdminRosterPageProps) {
  const { week } = await searchParams;
  // Week keys are always the Monday, computed on Sydney's calendar —
  // the server runs in bom1 and its local "today"/toISOString drifted
  // a day, starting the grid on Saturday. Normalising ?week also heals
  // old Sunday-keyed URLs from the pre-fix navigation.
  const weekParam =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : sydneyTodayIso();
  const weekStart = mondayOfIso(weekParam);

  // Batch every data fetch the shell needs. Regions + the centre/region
  // lookup are new — they back the Region filter chip without forcing
  // a wider per-session select. The `centresWithRegion` query uses the
  // server client (not the admin client `getCentresForSelect` uses) so
  // it respects RLS for the viewer.
  const supabase = await createSupabaseServerClient();
  const [
    sessionsRes,
    centresRes,
    coachesRes,
    activeTermRes,
    certWarningsRes,
    regionsRes,
    rosterPulse,
    latestRun,
    hasFinancialAccess,
    centresRegionRes,
  ] = await Promise.all([
    getSessionsForWeek(weekStart),
    getCentresForSelect(),
    getActiveCoaches(),
    getActiveTerm(),
    getSessionCertWarningsForWeek(weekStart),
    getRegions(),
    getRosterStatusPulse(weekStart),
    getLatestSchedulingRunForWeek(weekStart),
    getFinancialAccess(),
    supabase.from("centres").select("id, name, region_id").order("name"),
  ]);

  const firstError =
    sessionsRes.error ||
    centresRes.error ||
    coachesRes.error ||
    activeTermRes.error ||
    certWarningsRes.error;
  if (firstError) {
    return (
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  const centresWithRegion =
    (centresRegionRes.data as Array<{
      id: string;
      name: string;
      region_id: string | null;
    }> | null) ?? undefined;

  return (
    <RosterPage
      initialSessions={sessionsRes.data ?? []}
      initialWeekStart={weekStart}
      centres={centresRes.data ?? []}
      centresWithRegion={centresWithRegion}
      coaches={coachesRes.data ?? []}
      activeTerm={activeTermRes.data ?? null}
      regions={regionsRes.data ?? []}
      hasFinancialAccess={hasFinancialAccess}
      rosterPulse={rosterPulse}
      latestRun={latestRun}
      basePath="/admin/roster"
      sessionCertWarnings={certWarningsRes.data ?? undefined}
      viewerRole="admin"
    />
  );
}
