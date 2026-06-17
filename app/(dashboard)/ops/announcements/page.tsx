import { getAnnouncements } from "@/lib/announcements/actions";
import { getAnnouncementsStatusPulse } from "@/lib/announcements/status-pulse-actions";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { AnnouncementsStatusPulseStrip } from "@/components/announcements/announcements-status-pulse";

export default async function OpsAnnouncementsPage() {
  const [announcementsRes, pulse] = await Promise.all([
    getAnnouncements(),
    getAnnouncementsStatusPulse(),
  ]);

  const { data: announcements, error } = announcementsRes;

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <AnnouncementsStatusPulseStrip
        pulse={pulse}
        basePath="/ops/announcements"
      />
      <AnnouncementList
        initialAnnouncements={announcements ?? []}
        canCreate={true}
        role="ops"
      />
    </div>
  );
}
