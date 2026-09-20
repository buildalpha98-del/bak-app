import { sydneyTodayIso } from "@/lib/utils/sydney-time";

/**
 * Which sessions the nightly job closes. A published shift whose day has
 * passed in Sydney and that nobody checked out of is delivered as far as
 * the school is concerned — the term report and attendance rollups count
 * only `completed`, so leaving it `published` silently drops it from
 * every number the school sees. Drafts (never published), cancelled and
 * already-completed sessions are never touched.
 */
export const AUTOCOMPLETE_FROM_STATUSES = [
  "published",
  "pending_confirmation",
  "confirmed",
  "in_progress",
] as const;

export interface AutocompleteCandidate {
  id: string;
  date: string;
  status: string;
}

/** Sessions dated strictly before Sydney's today, in a closable status. */
export function sessionsToAutocomplete<T extends AutocompleteCandidate>(
  sessions: T[],
  now: Date = new Date()
): T[] {
  const today = sydneyTodayIso(now);
  return sessions.filter(
    (s) =>
      s.date < today &&
      (AUTOCOMPLETE_FROM_STATUSES as readonly string[]).includes(s.status)
  );
}
