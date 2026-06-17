import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAnnouncements } from "@/lib/announcements/actions";
import { getCoachAnnouncementsPulse } from "@/lib/coach/page-pulses";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";
import { Megaphone, CalendarDays } from "lucide-react";

export default async function CoachAnnouncementsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: announcements, error }, pulse] = await Promise.all([
    getAnnouncements(),
    getCoachAnnouncementsPulse(user.id),
  ]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <CoachPulseStrip
        items={[
          {
            icon: Megaphone,
            count: pulse.unreadCount,
            label: "unread",
            accent: true,
          },
          {
            icon: CalendarDays,
            count: pulse.thisWeekCount,
            label: "this week",
          },
        ]}
      />
      <AnnouncementList
        initialAnnouncements={announcements ?? []}
        canCreate={false}
        role="coach"
      />
    </div>
  );
}
