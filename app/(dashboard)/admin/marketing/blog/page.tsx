// ============================================================
// Admin / Blog — post list
// ============================================================
//
// A SERVER component, like its neighbour subscribers/page.tsx and
// unlike testimonials/page.tsx. That page reads through
// createBrowserClient, and blog_posts *would* in fact permit that —
// migration 070 gives it an admin `FOR ALL TO authenticated` policy,
// so an authenticated admin's browser client can read its rows (this
// is not the newsletter_subscribers situation, where RLS is on with no
// policies and a browser client sees nothing, ever).
//
// It is still the wrong choice here:
//
//  1. RLS denies by returning ZERO ROWS, not an error. A non-admin who
//     reached this page would see "No posts yet" — a lie that looks
//     like an empty blog rather than a refused request. Gating on the
//     server lets us redirect instead.
//  2. The editor's writes must go through self-gating server actions
//     regardless (a browser client cannot map a unique violation to a
//     friendly error, nor revalidate the public blog). Reading over one
//     transport and writing over another would leave two auth models to
//     keep in step.
//
// So both reads and writes go through lib/blog/admin-actions.ts, which
// authenticates and checks the role itself.

import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPostsForAdmin } from "@/lib/blog/admin-actions";
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
  title: "Blog | Build Alpha Kids",
};

// Drafts and publication state change from this very page — never
// serve a cached copy of the list.
export const dynamic = "force-dynamic";

/**
 * published_at is a timestamptz rendered on a UTC server, so the zone
 * has to be explicit: without it a 9pm Sydney publish shows the
 * previous day.
 */
function formatPublishedAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });
}

export default async function AdminBlogPage() {
  // The page authenticates itself rather than trusting middleware —
  // middleware's role hint is a 10-minute routing cache. Mirrors
  // subscribers/page.tsx: send a non-admin to their own portal rather
  // than to /login.
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

  const { data: posts, error } = await listPostsForAdmin();

  const publishedCount = posts.filter((p) => p.status === "published").length;
  const draftCount = posts.length - publishedCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Blog</h1>
          <p className="text-sm text-[#666666]">
            Write and publish posts for the marketing website.
          </p>
        </div>

        <Link
          href="/admin/marketing/blog/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white transition hover:bg-[#d4641f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Plus className="h-4 w-4" />
          New post
        </Link>
      </div>

      {error ? (
        <LoadError message={error} />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-green-100 text-green-700">
              {publishedCount} published
            </Badge>
            {draftCount > 0 && (
              <Badge variant="outline" className="text-[#666666]">
                {draftCount} draft{draftCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="rounded-2xl border bg-background p-6 text-center text-sm text-[#666666]">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              No posts yet. Create your first post to get started.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-[#1A1A1A]">
                        <Link
                          href={`/admin/marketing/blog/${p.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {p.title}
                        </Link>
                        <span className="block text-xs font-normal text-[#666666]">
                          /{p.slug}
                        </span>
                      </TableCell>
                      <TableCell>
                        {p.status === "published" ? (
                          <Badge className="bg-green-100 text-green-700">
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[#666666]">
                            Draft
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[#666666]">
                        {formatPublishedAt(p.published_at)}
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
