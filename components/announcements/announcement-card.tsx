"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EnrichedAnnouncement } from "@/lib/announcements/actions";
import type { UserRole } from "@/lib/types/enums";

interface AnnouncementCardProps {
  announcement: EnrichedAnnouncement;
  role: UserRole;
  onClick: () => void;
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAudienceLabel(audience: string): string {
  switch (audience) {
    case "all":
      return "All";
    case "ops_and_coaches":
      return "Ops & Coaches";
    case "coaches_only":
      return "Coaches Only";
    default:
      return audience;
  }
}

export function AnnouncementCard({
  announcement,
  role,
  onClick,
}: AnnouncementCardProps) {
  return (
    <Card
      className="card-hover cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      <CardContent className="p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {!announcement.is_read && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
            <h3 className="font-heading text-foreground font-semibold truncate">
              {announcement.title}
            </h3>
          </div>
          <Badge
            variant={announcement.audience === "all" ? "secondary" : undefined}
            className={
              announcement.audience !== "all"
                ? "bg-primary/10 text-primary border-0 shrink-0"
                : "shrink-0"
            }
          >
            {getAudienceLabel(announcement.audience)}
          </Badge>
        </div>

        {/* Body preview */}
        <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
          {announcement.body}
        </p>

        {/* Bottom row */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
              {getInitials(announcement.author_name)}
            </span>
            <span className="text-xs text-muted-foreground">
              {announcement.author_name}
            </span>
            <span className="text-xs text-muted-foreground">
              &middot; {formatRelativeTime(announcement.created_at)}
            </span>
          </div>

          {(role === "admin" || role === "ops") && (
            <span className="text-xs text-muted-foreground">
              Read by {announcement.read_count}/{announcement.audience_count}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
