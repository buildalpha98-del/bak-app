// ============================================================
// WordPress blog import — one-off migration, safe to re-run
// ============================================================
//
// Imports the legacy Build Alpha Kids WordPress blog into `blog_posts`
// as published rows, preserving the original slugs and publication
// dates.
//
// It reads scripts/data/wp-posts.json — a committed capture of the WP
// REST API — and NOT the WordPress site itself. That is deliberate:
// the import must not depend on the old host still being up at deploy
// time (it is decommissioned at cutover), the content is preserved in
// the repo permanently, and the conversion is reviewable in the diff
// rather than happening invisibly at runtime. See the seed's _README
// for provenance and the HTML->markdown conversion rules.
//
// RUN IT (after 070_blog_posts.sql is applied — the table must exist):
//
//   node --env-file=.env.production.local scripts/import-wp-posts.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. It writes
// with the service-role key, which bypasses RLS — blog_posts has no
// public-insert policy, so this is the only way in.
//
// Flags:
//   --dry-run   Report what would change; write nothing.
//   --force     Overwrite posts whose slug already exists.
//
// IDEMPOTENCY: matching is on `slug` (UNIQUE in 070). Re-running skips
// slugs already in the table, so it can never duplicate. Existing rows
// are left ALONE by default rather than upserted — once a post is
// imported, the admin blog editor is the source of truth, and a second
// run must not silently revert someone's edits. Use --force only when
// you actually intend to reset a post to its WordPress text.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.production.local scripts/import-wp-posts.mjs"
  );
  process.exit(1);
}

const seed = JSON.parse(
  readFileSync(join(__dirname, "data", "wp-posts.json"), "utf8")
);
const posts = seed.posts ?? [];
if (posts.length === 0) {
  console.error("Seed file contains no posts — refusing to run.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Seed -> row. `wp_cover_image_url` is intentionally NOT mapped: it is
 * a migration record of where the WP featured image used to live, not
 * a URL we want to serve (see the seed's _cover_images note).
 */
function toRow(post) {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    cover_image_url: post.cover_image_url,
    status: "published",
    published_at: post.published_at,
    author_name: post.author_name,
    tags: post.tags,
  };
}

async function main() {
  console.log(
    `Importing ${posts.length} WordPress posts` +
      `${dryRun ? " (dry run — no writes)" : ""}${force ? " (force: existing posts will be overwritten)" : ""}`
  );

  const { data: existingRows, error: readError } = await supabase
    .from("blog_posts")
    .select("slug")
    .in(
      "slug",
      posts.map((p) => p.slug)
    );

  if (readError) {
    console.error(`Could not read blog_posts: ${readError.message}`);
    console.error(
      "If the table does not exist, apply supabase/migrations/070_blog_posts.sql first."
    );
    process.exit(1);
  }

  const existing = new Set((existingRows ?? []).map((r) => r.slug));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const post of posts) {
    const row = toRow(post);
    const alreadyThere = existing.has(post.slug);

    if (alreadyThere && !force) {
      console.log(`  skip    ${post.slug} (already imported)`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  ${alreadyThere ? "update" : "insert"}  ${post.slug} (dry run)`);
      alreadyThere ? updated++ : inserted++;
      continue;
    }

    const { error } = alreadyThere
      ? await supabase.from("blog_posts").update(row).eq("slug", post.slug)
      : await supabase.from("blog_posts").insert(row);

    if (error) {
      console.error(`  FAILED  ${post.slug}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }

    console.log(`  ${alreadyThere ? "update" : "insert"}  ${post.slug}`);
    alreadyThere ? updated++ : inserted++;
  }

  console.log(
    `\nDone — ${inserted} inserted, ${updated} updated, ${skipped} skipped.`
  );
  if (skipped > 0 && !force) {
    console.log("Skipped posts already exist. Re-run with --force to overwrite them.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
