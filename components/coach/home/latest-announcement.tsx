"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import type { AnnouncementWithRead } from "@/lib/sessions/coach-actions";

// ============================================================
// Helpers
// ============================================================

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

// ============================================================
// Props
// ============================================================

interface LatestAnnouncementProps {
  announcement: AnnouncementWithRead | null;
}

// ============================================================
// Component
// ============================================================

export function LatestAnnouncement({
  announcement,
}: LatestAnnouncementProps) {
  if (!announcement) return null;

  return (
    <Card className="card-hover">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Megaphone className="size-4 text-primary" />
          Announcements
          {!announcement.isRead && (
            <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
              New
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <Link
            href="/coach/announcements"
            className="text-xs font-semibold text-primary active:opacity-70"
          >
            View All
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p
          className={`text-sm ${
            announcement.isRead ? "text-muted-foreground" : "font-medium text-foreground"
          }`}
        >
          {announcement.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {announcement.body}
        </p>
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          {timeAgo(announcement.created_at)}
        </p>
      </CardContent>
    </Card>
  );
}
