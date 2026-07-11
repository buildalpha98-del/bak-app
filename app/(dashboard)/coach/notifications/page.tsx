import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRecentNotifications } from "@/lib/notifications/actions";
import { getCoachNotificationsPulse } from "@/lib/coach/page-pulses";
import { NotificationsList } from "@/components/shared/notifications-list";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";

export default async function CoachNotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: notifications, error }, pulse] = await Promise.all([
    getRecentNotifications(50),
    getCoachNotificationsPulse(user.id),
  ]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 animate-fade-up">
      <CoachPulseStrip
        items={[
          {
            icon: "bell-ring",
            count: pulse.urgentCount,
            label: "urgent",
            accent: true,
          },
          {
            icon: "bell",
            count: pulse.importantCount,
            label: "important",
            accent: pulse.importantCount > 0,
          },
        ]}
      />
      <NotificationsList
        initialNotifications={notifications ?? []}
        userId={user.id}
        userRole="coach"
      />
    </div>
  );
}
