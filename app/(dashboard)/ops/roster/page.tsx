import { RosterPage } from "@/components/roster/roster-page";
import { getSessionsForWeek } from "@/lib/sessions/actions";
import { getCentresForSelect, getActiveCoaches, getActiveTerm } from "@/lib/terms/actions";
import { getComplianceWarningsForSessions } from "@/lib/sessions/scheduling-actions";
import { getUnconfirmedShifts } from "@/lib/sessions/shift-actions";
import { getMonday } from "@/lib/utils/roster";

interface OpsRosterPageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function OpsRosterPage({
  searchParams,
}: OpsRosterPageProps) {
  const { week } = await searchParams;
  const weekStart =
    week ?? getMonday(new Date()).toISOString().split("T")[0];

  const [
    sessionsRes,
    centresRes,
    coachesRes,
    activeTermRes,
    complianceRes,
    unconfirmedRes,
  ] = await Promise.all([
    getSessionsForWeek(weekStart),
    getCentresForSelect(),
    getActiveCoaches(),
    getActiveTerm(),
    getComplianceWarningsForSessions(weekStart),
    getUnconfirmedShifts(24),
  ]);

  const firstError =
    sessionsRes.error ||
    centresRes.error ||
    coachesRes.error ||
    activeTermRes.error ||
    complianceRes.error ||
    unconfirmedRes.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <RosterPage
      initialSessions={sessionsRes.data ?? []}
      initialWeekStart={weekStart}
      centres={centresRes.data ?? []}
      coaches={coachesRes.data ?? []}
      activeTerm={activeTermRes.data ?? null}
      basePath="/ops/roster"
      complianceWarnings={complianceRes.data ?? undefined}
      unconfirmedShifts={unconfirmedRes.data ?? undefined}
    />
  );
}
