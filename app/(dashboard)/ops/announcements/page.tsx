import { getAnnouncements } from "@/lib/announcements/actions";
import { AnnouncementList } from "@/components/announcements/announcement-list";

export default async function OpsAnnouncementsPage() {
  const { data: announcements } = await getAnnouncements();

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
