// ============================================================
// Admin / Newsletter subscribers
// ============================================================
//
// Read-only list + CSV export for the homepage newsletter capture
// (lib/marketing/newsletter.ts, migration 069).
//
// A SERVER component, unlike its neighbour testimonials/page.tsx —
// not a style choice. That page reads approved_testimonials through
// createBrowserClient, which works because the table has a read
// policy. newsletter_subscribers has RLS on with NO policies, so a
// browser client sees zero rows forever (and no error to explain
// why). The service-role read has to happen server-side, so the data
// fetch lives here and the page is async. Layout, empty state and
// header styling still follow testimonials/page.tsx.
//
// Being a server component also means the Export button is a plain
// link — no client JS, and the browser's own download handling.

import { redirect } from "next/navigation";
import { Download, Mail } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNewsletterSubscribers } from "@/lib/marketing/subscribers";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/ui/load-error";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = {
  title: "Newsletter Subscribers | Build Alpha Kids",
};

// Subscriber counts change on every signup, and the page reads through
// the service-role client — never serve a cached copy of a personal
// data list.
export const dynamic = "force-dynamic";

/**
 * Timestamps are stored as timestamptz and rendered on a server that
 * runs in UTC, so the zone has to be explicit: without it, a 9pm
 * Sydney signup renders as the previous day.
 */
function formatSubscribedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });
}

export default async function SubscribersPage() {
  // The page authenticates itself rather than trusting middleware —
  // middleware's role hint is a 10-minute routing cache, and this is
  // a list of personal data. Mirrors requireFinancialAccess(): send a
  // non-admin to their own portal rather than to /login.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.role !== "admin") {
    redirect(profile.role === "ops" ? "/ops" : "/coach");
  }

  const { data: subscribers, error } = await getNewsletterSubscribers();

  const subscribedCount = subscribers.filter(
    (s) => s.status === "subscribed"
  ).length;
  const unsubscribedCount = subscribers.length - subscribedCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Newsletter Subscribers
          </h1>
          <p className="text-sm text-[#666666]">
            Everyone who has signed up through the marketing website.
          </p>
        </div>

        {/* Plain link, not a fetch: the browser handles the download and
            the Content-Disposition filename. Disabled-looking when
            there is nothing to export, since an empty CSV helps no one. */}
        {subscribers.length > 0 ? (
          <a
            href="/api/admin/subscribers/export"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white transition hover:bg-[#d4641f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border bg-muted px-3 text-sm font-medium text-muted-foreground"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </span>
        )}
      </div>

      {error ? (
        <LoadError message={error} />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-green-100 text-green-700">
              {subscribedCount} subscribed
            </Badge>
            {unsubscribedCount > 0 && (
              <Badge variant="outline" className="text-[#666666]">
                {unsubscribedCount} unsubscribed
              </Badge>
            )}
          </div>

          {subscribers.length === 0 ? (
            <div className="rounded-2xl border bg-background p-6 text-center text-sm text-[#666666]">
              <Mail className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              No subscribers yet. Signups from the website newsletter form
              will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source Page</TableHead>
                    <TableHead>Subscribed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-[#1A1A1A]">
                        {s.email}
                      </TableCell>
                      <TableCell>
                        {s.status === "subscribed" ? (
                          <Badge className="bg-green-100 text-green-700">
                            Subscribed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[#666666]">
                            Unsubscribed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[#666666]">
                        {s.source_page ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[#666666]">
                        {formatSubscribedAt(s.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
