import { RosterPage } from "@/components/roster/roster-page";
import { getSessionsForWeek } from "@/lib/sessions/actions";
import {
  getCentresForSelect,
  getActiveCoaches,
  getActiveTerm,
} from "@/lib/terms/actions";
import { getSessionCertWarningsForWeek } from "@/lib/roster/cert-warnings-actions";
import { getUnconfirmedShifts } from "@/lib/sessions/shift-actions";
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

interface OpsRosterPageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function OpsRosterPage({
  searchParams,
}: OpsRosterPageProps) {
  const { week } = await searchParams;
  // Sydney-anchored Monday week key — see admin/roster/page.tsx.
  const weekParam =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : sydneyTodayIso();
  const weekStart = mondayOfIso(weekParam);

  const supabase = await createSupabaseServerClient();
  const [
    sessionsRes,
    centresRes,
    coachesRes,
    activeTermRes,
    certWarningsRes,
    unconfirmedRes,
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
    getUnconfirmedShifts(24),
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
    certWarningsRes.error ||
    unconfirmedRes.error;
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
      basePath="/ops/roster"
      sessionCertWarnings={certWarningsRes.data ?? undefined}
      unconfirmedShifts={unconfirmedRes.data ?? undefined}
      viewerRole="ops"
    />
  );
}
