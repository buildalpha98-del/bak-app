import { RosterPage } from "@/components/roster/roster-page";
import { getSessionsForWeek } from "@/lib/sessions/actions";
import { getCentresForSelect, getActiveCoaches, getActiveTerm } from "@/lib/terms/actions";
import { getSessionCertWarningsForWeek } from "@/lib/roster/cert-warnings-actions";
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

  const [sessionsRes, centresRes, coachesRes, activeTermRes, certWarningsRes] =
    await Promise.all([
      getSessionsForWeek(weekStart),
      getCentresForSelect(),
      getActiveCoaches(),
      getActiveTerm(),
      getSessionCertWarningsForWeek(weekStart),
    ]);

  const firstError =
    sessionsRes.error ||
    centresRes.error ||
    coachesRes.error ||
    activeTermRes.error ||
    certWarningsRes.error;
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
      basePath="/admin/roster"
      sessionCertWarnings={certWarningsRes.data ?? undefined}
    />
  );
}
