"use server";

// ============================================================
// Blog admin — reads and writes, SERVER ONLY
// ============================================================
//
// The admin counterpart to lib/marketing/blog.ts. That module filters
// to published posts and is the PUBLIC read path; reusing it here
// would hide the drafts this editor exists to edit. Hence the separate
// unfiltered queries below — the two must not be merged.
//
// ---- Why createSupabaseServerClient, not createSupabaseAdmin ----
//
// Unlike lib/marketing/subscribers.ts (newsletter_subscribers has RLS
// on with NO policies, so only the service-role client sees a row),
// blog_posts ships an admin `FOR ALL TO authenticated` policy in
// migration 070. Going through the user's own session therefore keeps
// RLS as a genuine second layer: the requireAdmin() guard below is the
// primary defence, and if it ever regressed, the policy still returns
// nothing to a parent/coach/ops session. The service-role client would
// throw that backstop away for no benefit — nothing here needs to read
// a row the acting admin cannot.
//
// ---- Why every export self-gates ----
//
// A "use server" export is a public POST endpoint. Server Actions do
// run through middleware, but middleware's role check is a 10-minute
// cached routing hint, not an authorisation boundary — so each action
// authenticates and checks the role itself. Guard shape copied from
// app/api/admin/subscribers/export/route.ts (in turn from
// app/api/forecasts/generate/route.ts): admin ONLY, deliberately not
// admin+ops, because middleware's ROLE_ROUTES gives ops no /admin
// access and these actions back an admin-only page.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validatePostInput,
  ADMIN_LIST_COLUMNS,
  ADMIN_DETAIL_COLUMNS,
  type AdminBlogPost,
} from "./admin-shared";

/** Postgres unique_violation. The only constraint on blog_posts is
 *  blog_posts_slug_key, so a 23505 here is always a duplicate slug. */
const UNIQUE_VIOLATION = "23505";

/** List-view shape: the columns in ADMIN_LIST_COLUMNS. */
export type AdminBlogPostListItem = Pick<
  AdminBlogPost,
  "id" | "slug" | "title" | "status" | "published_at" | "updated_at"
>;

type Result<T> = { data: T | null; error: string | null };

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Authenticate and require the admin role.
 *
 * Returns the client on success so callers cannot accidentally query
 * with an unguarded one — the only way to get a client here is to pass
 * the check.
 */
async function requireAdmin(): Promise<
  { supabase: Client; error: null } | { supabase: null; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase: null, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { supabase: null, error: "Forbidden" };
  }

  return { supabase, error: null };
}

/**
 * Map a write failure to something an author can act on.
 *
 * A raw PostgREST error would put `duplicate key value violates unique
 * constraint "blog_posts_slug_key"` in a toast. The slug is the one
 * field an author can fix, so say that.
 */
function writeError(error: { code?: string; message?: string }): string {
  if (error.code === UNIQUE_VIOLATION) {
    return "That slug is already used by another post. Try a different one.";
  }
  return "Could not save the post. Please try again.";
}

/**
 * Every post, newest first — drafts included.
 *
 * Ordered by created_at, NOT published_at: a draft has no publication
 * date, and ordering by a mostly-null column would scatter new drafts
 * to one end regardless of when they were written. The public list
 * (lib/marketing/blog.ts) orders by published_at because there every
 * row has one.
 */
export async function listPostsForAdmin(): Promise<
  { data: AdminBlogPostListItem[]; error: string | null }
> {
  const { supabase, error: authError } = await requireAdmin();
  if (!supabase) return { data: [], error: authError };

  const { data, error } = await supabase
    .from("blog_posts")
    .select(ADMIN_LIST_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: "Could not load blog posts." };

  return { data: (data ?? []) as unknown as AdminBlogPostListItem[], error: null };
}

/** One post by id, whatever its status. Null when it does not exist. */
export async function getPostForEdit(id: string): Promise<Result<AdminBlogPost>> {
  const { supabase, error: authError } = await requireAdmin();
  if (!supabase) return { data: null, error: authError };

  const { data, error } = await supabase
    .from("blog_posts")
    .select(ADMIN_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: "Could not load the post." };

  return { data: (data ?? null) as unknown as AdminBlogPost | null, error: null };
}

/**
 * Create a post. Always a draft: publishing is a separate, deliberate
 * action, so a mis-click on Save can never put a half-written post on
 * the public site.
 */
export async function createPost(input: unknown): Promise<Result<{ id: string }>> {
  const { supabase, error: authError } = await requireAdmin();
  if (!supabase) return { data: null, error: authError };

  const parsed = validatePostInput(input);
  if (!parsed.valid) return { data: null, error: parsed.error };

  const v = parsed.value;
  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      title: v.title,
      slug: v.slug,
      // The nullable columns are stored NULL rather than "" so the
      // public page's `?? fallback` checks behave.
      excerpt: v.excerpt || null,
      content: v.content,
      cover_image_url: v.cover_image_url || null,
      seo_title: v.seo_title || null,
      seo_description: v.seo_description || null,
      tags: v.tags,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { data: null, error: writeError(error) };

  revalidatePath("/admin/marketing/blog");
  return { data: data as { id: string }, error: null };
}

/**
 * Update a post's editable fields.
 *
 * Does not touch status or published_at — those move only through
 * setPostStatus, so an ordinary save can never publish or unpublish.
 */
export async function updatePost(id: string, input: unknown): Promise<Result<{ id: string }>> {
  const { supabase, error: authError } = await requireAdmin();
  if (!supabase) return { data: null, error: authError };

  const parsed = validatePostInput(input);
  if (!parsed.valid) return { data: null, error: parsed.error };

  const v = parsed.value;
  const { data, error } = await supabase
    .from("blog_posts")
    .update({
      title: v.title,
      slug: v.slug,
      excerpt: v.excerpt || null,
      content: v.content,
      cover_image_url: v.cover_image_url || null,
      seo_title: v.seo_title || null,
      seo_description: v.seo_description || null,
      tags: v.tags,
    })
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();

  if (error) return { data: null, error: writeError(error) };
  if (!data) return { data: null, error: "That post no longer exists." };

  const row = data as { id: string; slug: string };
  revalidatePath("/admin/marketing/blog");
  revalidatePath(`/admin/marketing/blog/${id}`);
  // The public routes land in Task 5.3; revalidating them now is a
  // no-op until then and correct the moment they exist.
  revalidatePath("/blog");
  revalidatePath(`/blog/${row.slug}`);
  return { data: { id: row.id }, error: null };
}

/**
 * Publish or unpublish.
 *
 * Publishing stamps published_at only when it is null. A re-publish
 * must not reset the date: it is the post's public "written on" date
 * and its sort key, so clobbering it would silently reorder the blog
 * and re-date an old post every time someone fixed a typo via
 * unpublish/republish. Unpublishing leaves the date alone for the same
 * reason — it is remembered, so a republish restores the original.
 */
export async function setPostStatus(
  id: string,
  status: "draft" | "published"
): Promise<Result<{ id: string; status: string; published_at: string | null }>> {
  const { supabase, error: authError } = await requireAdmin();
  if (!supabase) return { data: null, error: authError };

  if (status !== "draft" && status !== "published") {
    return { data: null, error: "Invalid status." };
  }

  const { data: existing, error: readError } = await supabase
    .from("blog_posts")
    .select("id, published_at")
    .eq("id", id)
    .maybeSingle();

  if (readError) return { data: null, error: "Could not load the post." };
  if (!existing) return { data: null, error: "That post no longer exists." };

  const current = existing as { id: string; published_at: string | null };

  const patch: { status: string; published_at?: string } = { status };
  if (status === "published" && current.published_at === null) {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("blog_posts")
    .update(patch)
    .eq("id", id)
    .select("id, slug, status, published_at")
    .maybeSingle();

  if (error) return { data: null, error: writeError(error) };
  if (!data) return { data: null, error: "That post no longer exists." };

  const row = data as {
    id: string;
    slug: string;
    status: string;
    published_at: string | null;
  };

  revalidatePath("/admin/marketing/blog");
  revalidatePath(`/admin/marketing/blog/${id}`);
  revalidatePath("/blog");
  revalidatePath(`/blog/${row.slug}`);

  return {
    data: { id: row.id, status: row.status, published_at: row.published_at },
    error: null,
  };
}
