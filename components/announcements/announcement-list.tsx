"use client";

import { useState } from "react";
import { Megaphone, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { AnnouncementDetail } from "@/components/announcements/announcement-detail";
import { CreateAnnouncementForm } from "@/components/announcements/create-announcement-form";
import { getAnnouncements } from "@/lib/announcements/actions";
import type { EnrichedAnnouncement } from "@/lib/announcements/actions";
import type { UserRole } from "@/lib/types/enums";

interface AnnouncementListProps {
  initialAnnouncements: EnrichedAnnouncement[];
  canCreate: boolean;
  role: UserRole;
}

export function AnnouncementList({
  initialAnnouncements,
  canCreate,
  role,
}: AnnouncementListProps) {
  const [announcements, setAnnouncements] =
    useState<EnrichedAnnouncement[]>(initialAnnouncements);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialAnnouncements.length >= 20);
  const [loading, setLoading] = useState(false);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<
    string | null
  >(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function loadMore() {
    setLoading(true);
    const nextPage = page + 1;
    const { data } = await getAnnouncements(nextPage);
    if (data && data.length > 0) {
      setAnnouncements((prev) => [...prev, ...data]);
      setPage(nextPage);
      setHasMore(data.length >= 20);
    } else {
      setHasMore(false);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Announcements
        </h1>
        {canCreate && (
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Announcement
          </Button>
        )}
      </div>

      {/* Create dialog */}
      {canCreate && (
        <CreateAnnouncementForm
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}

      {/* Announcement cards */}
      {announcements.length > 0 ? (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              role={role}
              onClick={() => setSelectedAnnouncementId(announcement.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-base font-heading font-semibold text-foreground mb-1">
            No announcements yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Announcements from the Build Alpha Kids team will appear here.
          </p>
        </div>
      )}

      {/* Load more */}
      {hasMore && announcements.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Load More
          </Button>
        </div>
      )}

      {/* Detail sheet */}
      <AnnouncementDetail
        announcementId={selectedAnnouncementId}
        role={role}
        onClose={() => setSelectedAnnouncementId(null)}
      />
    </div>
  );
}
