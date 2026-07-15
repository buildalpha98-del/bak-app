// ============================================================
// Newsletter subscribers — staff read path, SERVER ONLY
// ============================================================
//
// The read counterpart to subscribeToNewsletter (lib/marketing/
// newsletter.ts). newsletter_subscribers (migration 069) has RLS on
// with NO policies, so the service-role client is the only thing that
// can see a row — a browser client would read zero rows forever, not
// error. That is why this module exists rather than the admin page
// selecting through createBrowserClient the way the testimonials page
// does: approved_testimonials has a policy, this table does not.
//
// Service-role means RLS enforces nothing here, so EVERY caller must
// gate on role itself before calling. Callers today:
//   - app/(dashboard)/admin/marketing/subscribers/page.tsx
//   - app/api/admin/subscribers/export/route.ts
// Never import this from a "use client" component.

import { createSupabaseAdmin } from "@/lib/supabase/admin";

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: "subscribed" | "unsubscribed";
  source_page: string | null;
  created_at: string;
}

/** The export's column order, shared so page and CSV can't drift apart. */
export const SUBSCRIBER_CSV_HEADERS = [
  "email",
  "status",
  "source_page",
  "created_at",
] as const;

/**
 * Newest first. Returns { data, error } rather than throwing: both
 * callers need to degrade (the page renders LoadError, the route
 * returns 500) and neither wants an unhandled rejection.
 *
 * `limit` is deliberately optional and unset by default — an export
 * that silently stopped at 1,000 rows would be worse than a slow one.
 */
export async function getNewsletterSubscribers(
  limit?: number
): Promise<{ data: NewsletterSubscriber[]; error: string | null }> {
  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("newsletter_subscribers")
    .select("id, email, status, source_page, created_at")
    .order("created_at", { ascending: false });

  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { data: [], error: "Could not load newsletter subscribers." };
  }

  return { data: (data ?? []) as NewsletterSubscriber[], error: null };
}
