"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, FocusEvent, MouseEvent, TouchEvent } from "react";

// ============================================================
// Link — next/link, prefetched on intent instead of on sight
// ============================================================
//
// Next prefetches every visible <Link>, and on a dashboard that is
// ruinous: /admin/staff renders a row per coach, each row links to a
// detail page, and the measured result was 42 route requests for one
// visit — the page the user asked for queueing behind forty-one they
// didn't. So viewport prefetch stays off.
//
// But prefetch={false} on next/link ALSO turns off hover prefetch (App
// Router: link.js returns early on mouseenter when prefetch is false).
// That left every click with nothing in the client cache: no loading
// skeleton, no layout, so the old page sat frozen until the server's
// first byte came back from Mumbai — ~1s of "did my click work?".
//
// So this prefetches on INTENT — pointer over, finger down, keyboard
// focus — with router.prefetch's default kind: the route down to its
// nearest loading.tsx, not the page's own queries. By the time the
// click lands the skeleton is cached and renders immediately; the page
// streams in behind it. Next dedupes repeat prefetches of the same href.
//
// Pass prefetch to override: true/"auto"/null hand the link back to
// Next's own viewport prefetch (reasonable for a link that is nearly
// always clicked next).
type Props = ComponentProps<typeof NextLink>;

export default function Link({
  prefetch = false,
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: Props) {
  const router = useRouter();
  const href = typeof props.href === "string" ? props.href : null;

  function prefetchOnIntent() {
    // Object hrefs are rare here and would need formatting; external
    // links aren't routes. Both just navigate normally.
    if (prefetch !== false || !href || !href.startsWith("/")) return;
    router.prefetch(href);
  }

  return (
    <NextLink
      prefetch={prefetch}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(e);
        prefetchOnIntent();
      }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => {
        onTouchStart?.(e);
        prefetchOnIntent();
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(e);
        prefetchOnIntent();
      }}
      {...props}
    />
  );
}
