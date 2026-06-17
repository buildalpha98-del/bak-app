import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getCoachSessionsForDate,
  getCoachSessionsForWeek,
  getCoachSessionsForTerm,
  getCoachPendingSessions,
} from "@/lib/sessions/coach-actions";
import { getCoachSchedulePulse } from "@/lib/coach/status-pulse-actions";
import { getActiveTerm } from "@/lib/terms/actions";
import { getMonday } from "@/lib/utils/roster";
import { ScheduleTabsWrapper } from "@/components/coach/schedule/schedule-tabs-wrapper";
import { TodayView } from "@/components/coach/schedule/today-view";
import { WeekView } from "@/components/coach/schedule/week-view";
import { TermView } from "@/components/coach/schedule/term-view";
import { CoachSchedulePulseStrip } from "@/components/coach/schedule/coach-schedule-pulse";
import { CalendarSubscribeButton } from "@/components/calendar/calendar-subscribe-button";
import { getCalendarToken } from "@/lib/calendar/actions";

interface SchedulePageProps {
  searchParams: Promise<{ tab?: string; date?: string }>;
}

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { tab, date } = await searchParams;
  const activeTab =
    tab === "week" || tab === "term" ? tab : "today";

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const dateStr = date ?? todayStr;
  const mondayStr =
    date ?? getMonday(today).toISOString().split("T")[0];

  // Fetch data based on active tab + always fetch pending sessions for bulk confirm + pulse
  const [todayRes, weekRes, termRes, pendingRes, schedulePulse] =
    await Promise.all([
      activeTab === "today"
        ? getCoachSessionsForDate(user.id, dateStr)
        : Promise.resolve({ data: null, error: null }),
      activeTab === "week"
        ? getCoachSessionsForWeek(user.id, mondayStr)
        : Promise.resolve({ data: null, error: null }),
      activeTab === "term"
        ? getActiveTerm()
        : Promise.resolve({ data: null, error: null }),
      getCoachPendingSessions(user.id),
      getCoachSchedulePulse(user.id),
    ]);

  const firstError = todayRes.error || weekRes.error || termRes.error || pendingRes.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  // If term tab, fetch term sessions once we have the term
  let termSessions: Awaited<
    ReturnType<typeof getCoachSessionsForTerm>
  >["data"] = null;
  if (activeTab === "term" && termRes.data) {
    const termSessionsRes = await getCoachSessionsForTerm(
      user.id,
      termRes.data.id
    );
    termSessions = termSessionsRes.data;
  }

  const { token: coachCalToken } = await getCalendarToken("coach", user.id);
  const feedUrl = coachCalToken
    ? `https://buildalphakids.app/api/calendar/coach/${coachCalToken}.ics`
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold font-heading text-foreground">
          Schedule
        </h1>
        {feedUrl && (
          <CalendarSubscribeButton
            feedUrl={feedUrl}
            label="your sessions"
          />
        )}
      </div>

      <CoachSchedulePulseStrip pulse={schedulePulse} />

      <ScheduleTabsWrapper
        activeTab={activeTab}
        currentDate={dateStr}
        pendingSessions={pendingRes.data ?? undefined}
      >
        {{
          today: (
            <TodayView
              sessions={todayRes.data ?? []}
            />
          ),
          week: (
            <WeekView
              sessions={weekRes.data ?? []}
              weekStart={new Date(mondayStr + "T00:00:00")}
            />
          ),
          term: (
            <TermView
              sessions={termSessions ?? []}
              term={termRes.data ?? null}
            />
          ),
        }}
      </ScheduleTabsWrapper>
    </div>
  );
}
