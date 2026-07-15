// ============================================================
// Blog admin helpers — pure + client-safe
// ============================================================
//
// Slug derivation and payload validation, shared by the server
// action layer (lib/blog/admin-actions.ts) and the "use client"
// editor page. This module MUST stay free of server-only imports
// (Supabase admin client, service-role env) — the editor imports
// slugify as a *value*, so anything server-only in here would be
// bundled into the browser.
//
// Validation is hand-rolled rather than zod: zod is not a dependency
// of this repo. The shape follows app/api/crm/enquiry/route.ts —
// check, collect a human-readable message, return early.

/** The editable fields of a post. Status/published_at are moved by
 *  their own actions, never by a form field, so they are not here. */
export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  seo_title: string;
  seo_description: string;
  tags: string[];
}

/** A post row as the admin list and editor read it. Unlike
 *  PublicBlogPost this is unfiltered — drafts included. */
export interface AdminBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  status: "draft" | "published";
  published_at: string | null;
  author_name: string;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

/** List-view columns. `content` is excluded — the table never shows a body. */
export const ADMIN_LIST_COLUMNS =
  "id, slug, title, status, published_at, updated_at";

/** Everything the editor needs to populate its form. */
export const ADMIN_DETAIL_COLUMNS =
  "id, slug, title, excerpt, content, cover_image_url, status, published_at, author_name, tags, seo_title, seo_description, created_at, updated_at";

// Guard-rails that mirror what the column types can actually hold and
// what the public pages can sensibly render. Titles/slugs are text in
// Postgres (unbounded), so these are product limits, not storage ones.
const MAX_TITLE = 200;
const MAX_SLUG = 200;
const MAX_EXCERPT = 500;
const MAX_SEO_TITLE = 70;
const MAX_SEO_DESCRIPTION = 200;
const MAX_TAGS = 10;

/**
 * Turn a title into a URL slug: lowercase, non-alphanumerics become
 * hyphens, runs collapse, ends trimmed.
 *
 * Deliberately ASCII-only. An accented or non-Latin title collapses
 * toward empty rather than emitting percent-encoded bytes into a
 * public URL — the editor surfaces that as "slug required" and the
 * author types one, which is better than a slug nobody can read.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ValidationResult =
  | { valid: true; value: BlogPostInput }
  | { valid: false; error: string };

/**
 * Validate and normalise an editor payload.
 *
 * Runs on the server against whatever arrives, not just what the form
 * sends: a "use server" export is a public POST endpoint, so the
 * client-side field limits are a convenience and this is the check
 * that counts.
 *
 * Normalises rather than merely rejecting: trims every string, re-runs
 * slugify over the slug (so a hand-edited slug can't smuggle in
 * uppercase, spaces or a slash), and drops blank/duplicate tags.
 */
export function validatePostInput(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid request." };
  }

  const body = raw as Record<string, unknown>;

  const str = (key: string): string | null => {
    const v = body[key];
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") return null;
    return v.trim();
  };

  const title = str("title");
  if (title === null) return { valid: false, error: "Invalid title." };
  if (!title) return { valid: false, error: "Title is required." };
  if (title.length > MAX_TITLE) {
    return { valid: false, error: `Title must be ${MAX_TITLE} characters or fewer.` };
  }

  const rawSlug = str("slug");
  if (rawSlug === null) return { valid: false, error: "Invalid slug." };
  // Re-derive rather than trust: the field is editable, and the slug is
  // a public URL segment.
  const slug = slugify(rawSlug);
  if (!slug) {
    return {
      valid: false,
      error: "Slug is required, and must contain at least one letter or number.",
    };
  }
  if (slug.length > MAX_SLUG) {
    return { valid: false, error: `Slug must be ${MAX_SLUG} characters or fewer.` };
  }

  const excerpt = str("excerpt");
  if (excerpt === null) return { valid: false, error: "Invalid excerpt." };
  if (excerpt.length > MAX_EXCERPT) {
    return { valid: false, error: `Excerpt must be ${MAX_EXCERPT} characters or fewer.` };
  }

  // Not trimmed to empty-check: an empty body is a legitimate draft.
  // The column is NOT NULL DEFAULT '' for exactly this reason.
  const contentRaw = body["content"];
  if (contentRaw !== undefined && contentRaw !== null && typeof contentRaw !== "string") {
    return { valid: false, error: "Invalid content." };
  }
  const content = typeof contentRaw === "string" ? contentRaw : "";

  const coverImageUrl = str("cover_image_url");
  if (coverImageUrl === null) {
    return { valid: false, error: "Invalid cover image URL." };
  }
  if (coverImageUrl && !/^https?:\/\/\S+$/i.test(coverImageUrl)) {
    return {
      valid: false,
      error: "Cover image URL must start with http:// or https://",
    };
  }

  const seoTitle = str("seo_title");
  if (seoTitle === null) return { valid: false, error: "Invalid SEO title." };
  if (seoTitle.length > MAX_SEO_TITLE) {
    return {
      valid: false,
      error: `SEO title must be ${MAX_SEO_TITLE} characters or fewer.`,
    };
  }

  const seoDescription = str("seo_description");
  if (seoDescription === null) {
    return { valid: false, error: "Invalid SEO description." };
  }
  if (seoDescription.length > MAX_SEO_DESCRIPTION) {
    return {
      valid: false,
      error: `SEO description must be ${MAX_SEO_DESCRIPTION} characters or fewer.`,
    };
  }

  const rawTags = body["tags"];
  let tags: string[] = [];
  if (rawTags !== undefined && rawTags !== null) {
    if (!Array.isArray(rawTags) || rawTags.some((t) => typeof t !== "string")) {
      return { valid: false, error: "Invalid tags." };
    }
    // Blank entries come from a trailing comma in the editor's field;
    // dedupe so `a, a` doesn't render twice on the public post.
    tags = [...new Set((rawTags as string[]).map((t) => t.trim()).filter(Boolean))];
    if (tags.length > MAX_TAGS) {
      return { valid: false, error: `A post can have at most ${MAX_TAGS} tags.` };
    }
  }

  return {
    valid: true,
    value: {
      title,
      slug,
      excerpt,
      content,
      cover_image_url: coverImageUrl,
      seo_title: seoTitle,
      seo_description: seoDescription,
      tags,
    },
  };
}

/** Comma-separated field <-> tag array, for the editor's tags input. */
export function parseTagsField(value: string): string[] {
  return [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))];
}
