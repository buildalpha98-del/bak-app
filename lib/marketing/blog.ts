// ============================================================
// Public blog query layer — SERVER ONLY
// ============================================================
//
// Uses the service-role Supabase client, so never import this from a
// "use client" component. The blog's public pages are server
// components, and there is no pure logic here worth splitting into a
// -shared module the way clinics did — the whole file is queries.
// Type-only imports (`import type { PublicBlogPost }`) are erased at
// compile time and are safe from client components; a *value* import
// is not. If client-side blog logic ever appears, split it out then.
//
// Because the service-role client bypasses RLS, the published gate
// below IS the access control for public reads. Both functions apply
// it; a draft or future-dated post must never leak out of here.

import { createSupabaseAdmin } from "@/lib/supabase/admin";

/** List-view fields. Excludes `content` — the list never renders it. */
export type PublicBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  author_name: string;
  tags: string[];
};

/** A single post's fields, including body and SEO overrides. */
export type PublicBlogPostDetail = PublicBlogPost & {
  content: string;
  seo_title: string | null;
  seo_description: string | null;
};

const LIST_COLUMNS =
  "id, slug, title, excerpt, cover_image_url, published_at, author_name, tags";

const DETAIL_COLUMNS = `${LIST_COLUMNS}, content, seo_title, seo_description`;

/**
 * Posts visible to the public, newest first.
 *
 * `published_at` is a timestamptz compared against the current
 * instant, so a plain UTC ISO string is correct — this is NOT the
 * Sydney-day rule that applies to DATE columns (clinics/leads), and
 * using sydneyTodayIso() here would shift the gate by hours.
 *
 * A post scheduled for later stays hidden until its timestamp passes.
 * A 'published' row with a NULL published_at is also excluded: in SQL
 * `NULL <= now()` is NULL, not true, so it fails the filter — which is
 * what we want, since it has no publication date to sort or show.
 */
export async function getPublishedPosts(limit?: number): Promise<PublicBlogPost[]> {
  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PublicBlogPost[];
}

/**
 * A single public post, or null when the slug does not exist or the
 * post is not publicly visible yet.
 *
 * The status/date gate is repeated here rather than filtered after
 * the fetch: a draft slug must be indistinguishable from a missing
 * one so the page 404s instead of rendering unpublished work to
 * anyone who guesses the URL.
 */
export async function getPostBySlug(slug: string): Promise<PublicBlogPostDetail | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(DETAIL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as PublicBlogPostDetail | null;
}
