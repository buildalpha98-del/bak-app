import NextLink from "next/link";
import type { ComponentProps } from "react";

// ============================================================
// Link — next/link with viewport prefetch off by default
// ============================================================
//
// Next prefetches every visible <Link>, and a prefetch of an App Router
// route is a full server render of it, queries included. On a dashboard
// that is ruinous: /admin/staff renders a row per coach, each row links
// to a detail page, and the measured result was 42 route renders for one
// visit — the page the user asked for queueing behind forty-one they
// didn't. /admin fired 21, /admin/bookings 18.
//
// prefetch={false} does not mean "never prefetch": Next still prefetches
// on hover, which is where the perceived snappiness actually comes from.
// It only drops the on-sight storm.
//
// Prefer this over next/link everywhere. Pass prefetch to override —
// prefetch on a link that is nearly always clicked next is a reasonable
// call; prefetching forty rows nobody will open is not.
export default function Link({
  prefetch = false,
  ...props
}: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
