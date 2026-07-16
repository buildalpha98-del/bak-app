import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { BlogCard, BlogEmptyState } from "@/components/marketing/blog-card";
import { getPublishedPosts, type PublicBlogPost } from "@/lib/marketing/blog";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import { BLOG_INDEX } from "@/lib/marketing/content";

/** ISR — a newly published post appears within 5 minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Blog",
  description: BLOG_INDEX.description,
  alternates: { canonical: "/blog" },
};

/**
 * /blog — hero-lite orange band, then every published post as a
 * sticker card, newest first. The fetch is wrapped so a DB error
 * renders the same empty state as "nothing published yet" rather than
 * a broken page — the posture every marketing surface takes.
 *
 * Unlike the homepage teasers (which render nothing when empty), this
 * page always renders its heading and an explanation: someone
 * navigated here on purpose.
 */
export default async function BlogPage() {
  const posts = await safeFetch<PublicBlogPost[]>(() => getPublishedPosts(), []);

  return (
    <>
      <HeroLite
        label="Blog"
        eyebrow={BLOG_INDEX.eyebrow}
        title={BLOG_INDEX.title}
        intro={BLOG_INDEX.intro}
      />

      <Section aria-label="Blog posts" className="bg-white">
        {posts.length === 0 ? (
          <BlogEmptyState />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
