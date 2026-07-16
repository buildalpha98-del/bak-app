import { SYDNEY_TZ } from "./sydney-time";

// ============================================================
// Relative time — pure, testable, timezone-safe
// ============================================================
//
// `now` is a parameter, never an ambient Date.now() read, so the result
// is a function of its inputs and can be tested at a fixed instant. The
// <TimeAgo> component owns the clock; this module owns the wording.

export function formatTimeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatAbsoluteDate(iso);
}

/**
 * Stable absolute date, always rendered in Sydney regardless of where
 * the code runs. Used as the pre-hydration text: the server and the
 * client's first render must agree, and only an absolute value can.
 */
export function formatAbsoluteDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: SYDNEY_TZ,
  }).format(new Date(iso));
}

/** Full timestamp for a tooltip — the exact value behind "3h ago". */
export function formatAbsoluteDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: SYDNEY_TZ,
  }).format(new Date(iso));
}
