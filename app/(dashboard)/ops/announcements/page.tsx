import { getAnnouncements } from "@/lib/announcements/actions";
import { AnnouncementList } from "@/components/announcements/announcement-list";

export default async function OpsAnnouncementsPage() {
  const { data: announcements, error } = await getAnnouncements();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <AnnouncementList
        initialAnnouncements={announcements ?? []}
        canCreate={true}
        role="ops"
      />
    </div>
  );
}
