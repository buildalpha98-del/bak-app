import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
import { ArrowLeft } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import {
  getPostBySlug,
  getPublishedPosts,
  type PublicBlogPostDetail,
} from "@/lib/marketing/blog";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import { formatPostDate } from "@/lib/marketing/blog-shared";
import {
  BALL_COLORS,
  BLOG_POST,
  SITE,
  truncateDescription,
} from "@/lib/marketing/content";

/** ISR — an edited post refreshes within 5 minutes. */
export const revalidate = 300;

/**
 * Prerender every published post at build time. Wrapped in safeFetch
 * because a build must never be hostage to the database: on any error
 * this returns [] and every post falls back to on-demand rendering
 * (dynamicParams defaults to true), which is exactly what happens
 * today — 070_blog_posts.sql is deliberately unapplied, so the table
 * does not exist and this route prerenders ZERO paths. The build still
 * succeeds; posts render on first request once the table is there.
 */
export async function generateStaticParams() {
  const posts = await safeFetch(() => getPublishedPosts(), []);
  return posts.map((post) => ({ slug: post.slug }));
}

/** Next 16 — `params` is a Promise and must be awaited. */
type PostPageProps = { params: Promise<{ slug: string }> };

/**
 * A post's own SEO overrides win; otherwise the title and excerpt do
 * the job. Both descriptions run through truncateDescription: the
 * admin editor accepts a seo_description up to 200 chars and an
 * excerpt has no cap at all, so neither can be trusted to sit inside
 * the ~160 char search cutoff. The static pages' descriptions are
 * hand-written and guarded by a test; these are DB-driven and can't
 * be, so the clamp is the guard.
 */
export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await safeFetch<PublicBlogPostDetail | null>(
    () => getPostBySlug(slug),
    null
  );

  if (!post) return { title: `Blog — ${SITE.name}` };

  const description = post.seo_description ?? post.excerpt;

  return {
    title: post.seo_title ?? `${post.title} — ${SITE.name}`,
    description: description ? truncateDescription(description) : undefined,
  };
}

/**
 * Markdown element styling. Tailwind's preflight strips the browser's
 * default margins, and @tailwindcss/typography is NOT installed (the
 * `prose` classes elsewhere in the app are silent no-ops), so every
 * element a post can contain has to be styled here or it renders as
 * one cramped wall of text. No new dependency for this — the map is
 * small and keeps the body inside the design system.
 *
 * Every override destructures `node` away before spreading the rest.
 * react-markdown hands each component the mdast node, which is not an
 * HTML attribute: spreading it through emits node="[object Object]" on
 * every element in the body. Typing the map as `Components` is what
 * makes that a compile-time concern rather than something you notice
 * in the page source.
 */
const MARKDOWN_COMPONENTS: Components = {
  p: ({ node, ...props }) => (
    <p
      className="mt-5 text-base leading-relaxed text-[#1A1A1A] sm:text-lg"
      {...props}
    />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-heading font-extrabold text-[#111]" {...props} />
  ),
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  h2: ({ node, ...props }) => (
    <h2
      className="mt-12 font-heading text-2xl font-extrabold tracking-tight text-[#111] sm:text-3xl"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      className="mt-10 font-heading text-xl font-extrabold tracking-tight text-[#111] sm:text-2xl"
      {...props}
    />
  ),
  ul: ({ node, ...props }) => (
    <ul
      className="mt-5 list-disc space-y-2 pl-6 text-base leading-relaxed text-[#1A1A1A] sm:text-lg"
      {...props}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      className="mt-5 list-decimal space-y-2 pl-6 text-base leading-relaxed text-[#1A1A1A] sm:text-lg"
      {...props}
    />
  ),
  a: ({ node, ...props }) => (
    <a
      className="font-semibold text-[#993C1D] underline underline-offset-2 hover:text-[#111]"
      {...props}
    />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-6 border-l-4 border-[#FFD23F] pl-5 text-base font-medium italic leading-relaxed text-[#1A1A1A]/80 sm:text-lg"
      {...props}
    />
  ),
  img: ({ node, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="mt-6 rounded-xl border-2 border-[#111]"
      alt={alt ?? ""}
      {...props}
    />
  ),
};

/**
 * /blog/[slug] — hero-lite band carrying the post's own title, then
 * the markdown body.
 *
 * A draft, a scheduled-for-later post and an unknown slug are all
 * indistinguishable here: getPostBySlug applies the published gate and
 * returns null for every one of them, and this 404s. Guessing a draft
 * URL must never reveal that the draft exists.
 *
 * getPostBySlug is NOT wrapped in safeFetch: on this page the post IS
 * the page. Degrading a DB error to null would 404 a post that exists,
 * telling crawlers it's gone — better to fail loudly and let the error
 * boundary handle it.
 */
export default async function BlogPostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  const accent = BALL_COLORS.yellow;

  return (
    <>
      <HeroLite
        label={post.title}
        eyebrow={post.published_at ? formatPostDate(post.published_at) : "Blog"}
        title={post.title}
        intro={post.excerpt ?? undefined}
      />

      <Section aria-label="Post" className="bg-white">
        <article className="mx-auto max-w-3xl">
          {post.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.cover_image_url}
              alt=""
              className="mb-10 h-auto w-full rounded-2xl border-2 border-[#111] shadow-[4px_4px_0_#111]"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-block rounded-full border-2 border-[#111] px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: accent.color, color: accent.fg }}
            >
              {post.author_name}
            </span>
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full border-2 border-[#111]/30 px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]/70"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-2">
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {post.content}
            </ReactMarkdown>
          </div>

          <div className="mt-14 border-t-2 border-[#111]/10 pt-8">
            <Link
              href="/blog"
              className="inline-flex min-h-11 items-center gap-2 font-heading text-sm font-bold text-[#111] hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {BLOG_POST.backLabel}
            </Link>
          </div>
        </article>
      </Section>
    </>
  );
}
