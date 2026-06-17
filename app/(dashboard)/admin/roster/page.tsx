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
import { getMonday } from "@/lib/utils/roster";

interface AdminRosterPageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function AdminRosterPage({
  searchParams,
}: AdminRosterPageProps) {
  const { week } = await searchParams;
  const weekStart =
    week ?? getMonday(new Date()).toISOString().split("T")[0];

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
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
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
    />
  );
}
