"use client";

import { useEffect, useState, useCallback } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { CheckCircle2, Clock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnnouncementDetail } from "@/lib/announcements/actions";
import type { AnnouncementDetail as AnnouncementDetailType } from "@/lib/announcements/actions";
import type { UserRole } from "@/lib/types/enums";

interface AnnouncementDetailProps {
  announcementId: string | null;
  role: UserRole;
  onClose: () => void;
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

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

/**
 * Markdown element styling for an announcement body.
 *
 * Tailwind's preflight strips the browser's default margins, and
 * @tailwindcss/typography is NOT installed — so the `prose prose-sm`
 * classes that used to sit on the wrapper here were silent no-ops and
 * every announcement rendered as one unstyled wall of text: no heading
 * sizes, no bullets, no paragraph spacing.
 *
 * Styled explicitly rather than by installing the plugin: this is the
 * only `prose` consumer in the app, so the plugin's "fixes everything
 * at once" upside is worth nothing here, and typography's hardcoded
 * `--tw-prose-*` palette would override `text-foreground` on children
 * and break this sheet in dark mode. The marketing blog body solves the
 * same problem the same way.
 *
 * Colours come from design tokens, NOT the literal hex the marketing
 * pages use — those render on an always-light background; this sheet is
 * themed and must follow dark mode.
 *
 * Every override destructures `node` away before spreading the rest.
 * react-markdown passes the mdast node, which is not an HTML attribute:
 * spreading it emits node="[object Object]" on every element. Typing the
 * map as `Components` makes that a compile-time concern.
 */
export const MARKDOWN_COMPONENTS: Components = {
  p: ({ node, ...props }) => (
    <p className="mt-4 text-sm leading-relaxed text-foreground" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  h1: ({ node, ...props }) => (
    <h1
      className="mt-6 font-heading text-lg font-bold tracking-tight text-foreground"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="mt-6 font-heading text-base font-bold tracking-tight text-foreground"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      className="mt-5 font-heading text-sm font-bold tracking-tight text-foreground"
      {...props}
    />
  ),
  ul: ({ node, ...props }) => (
    <ul
      className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground"
      {...props}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground"
      {...props}
    />
  ),
  li: ({ node, ...props }) => <li className="pl-1" {...props} />,
  a: ({ node, ...props }) => (
    <a
      className="font-medium text-primary underline underline-offset-2 hover:text-foreground"
      {...props}
    />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-4 border-l-4 border-primary pl-4 text-sm italic leading-relaxed text-muted-foreground"
      {...props}
    />
  ),
  code: ({ node, ...props }) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
      {...props}
    />
  ),
  pre: ({ node, ...props }) => (
    <pre
      className="mt-4 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground"
      {...props}
    />
  ),
  hr: ({ node, ...props }) => (
    <hr className="my-6 border-border" {...props} />
  ),
};

export function AnnouncementDetail({
  announcementId,
  role,
  onClose,
}: AnnouncementDetailProps) {
  const [announcement, setAnnouncement] =
    useState<AnnouncementDetailType | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    const { data } = await getAnnouncementDetail(id);
    setAnnouncement(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (announcementId) {
      fetchDetail(announcementId);
    } else {
      setAnnouncement(null);
    }
  }, [announcementId, fetchDetail]);

  return (
    <Sheet
      open={!!announcementId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : announcement ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-xl font-heading text-foreground">
                  {announcement.title}
                </SheetTitle>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={
                    announcement.audience === "all" ? "secondary" : undefined
                  }
                  className={
                    announcement.audience !== "all"
                      ? "bg-primary/10 text-primary border-0"
                      : ""
                  }
                >
                  {getAudienceLabel(announcement.audience)}
                </Badge>
              </div>
              <SheetDescription className="flex items-center gap-1 mt-1">
                <span>{announcement.author_name}</span>
                <span>&middot;</span>
                <span>{formatTimestamp(announcement.created_at)}</span>
              </SheetDescription>
            </SheetHeader>

            {/* Body */}
            <div className="px-4 pb-4 text-foreground">
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                {announcement.body}
              </ReactMarkdown>
            </div>

            {/* Read receipts (admin/ops only) */}
            {(role === "admin" || role === "ops") &&
              announcement.read_receipts && (
                <>
                  <div className="px-4">
                    <Separator />
                  </div>
                  <div className="px-4 pb-4 pt-2">
                    <h4 className="text-sm font-heading font-semibold text-foreground mb-3">
                      Read Receipts
                    </h4>
                    <div className="space-y-2">
                      {announcement.read_receipts.map((receipt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm"
                        >
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-foreground">
                            {receipt.user_name}
                          </span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            read {formatRelativeTime(receipt.read_at)}
                          </span>
                        </div>
                      ))}
                      {announcement.read_receipts.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No one has read this announcement yet.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
          </>
        ) : (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Announcement not found.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
