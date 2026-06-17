"use client";

import { useState } from "react";
import { Calendar, Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CalendarSubscribeButtonProps {
  /** Full feed URL, e.g. `https://buildalphakids.app/api/calendar/coach/<token>.ics` */
  feedUrl: string;
  /** Audience label shown in the popover heading. */
  label: string;
}

/**
 * Small calendar icon button → popover with copy-feed-URL,
 * webcal:// link, Google Calendar add link, and Apple instructions.
 *
 * Used on /coach/schedule, /parent home and /client/[centreId].
 */
export function CalendarSubscribeButton({
  feedUrl,
  label,
}: CalendarSubscribeButtonProps) {
  const [copied, setCopied] = useState(false);

  // webcal:// is the unofficial-but-universal subscription scheme — Apple
  // Calendar and Outlook will open this directly; Chrome on desktop prompts
  // the user with their default handler.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");

  // Google Calendar "add by URL": their public endpoint forwards to the
  // settings/addbyurl form with the cid pre-filled. encodeURIComponent so
  // tokens with dashes survive the round trip.
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl)}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      toast.success("Calendar URL copied.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy. Long-press to select.");
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 min-h-[44px] sm:min-h-0 sm:h-9"
            aria-label="Subscribe to calendar"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Subscribe</span>
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-80 flex flex-col gap-3 p-4"
      >
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">
            Subscribe to {label}
          </p>
          <p className="text-xs text-muted-foreground">
            Stay in sync with Apple, Google or Outlook Calendar. Updates land
            every five minutes.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="justify-start gap-2 min-h-[44px]"
            onClick={copyUrl}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="truncate">
              {copied ? "Copied" : "Copy feed URL"}
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2 min-h-[44px]"
            render={
              <a href={webcalUrl}>
                <Calendar className="h-4 w-4" />
                <span>Open in Apple Calendar</span>
              </a>
            }
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2 min-h-[44px]"
            render={
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Add to Google Calendar</span>
              </a>
            }
          />
        </div>

        <div className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Outlook / other</p>
          <p>
            Copy the feed URL and paste it into your calendar app under
            &ldquo;Add internet calendar&rdquo; or &ldquo;Subscribe to
            calendar&rdquo;.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
