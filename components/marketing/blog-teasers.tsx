import { ArrowRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { StickerButton } from "@/components/marketing/sticker-button";
import { BlogCard } from "@/components/marketing/blog-card";
import { getPublishedPosts, type PublicBlogPost } from "@/lib/marketing/blog";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import { BLOG_TEASERS } from "@/lib/marketing/content";

/**
 * The homepage's three latest posts. SERVER ONLY: it reads through the
 * service-role client. Freshness comes from the host page's ISR window
 * (revalidate 300).
 *
 * Failure posture: an empty blog and a failed fetch both render
 * NOTHING — not the heading, not the "read all posts" button, not an
 * empty grid. The homepage flows straight from the B2B band to the
 * newsletter, exactly as it did before this section existed. This
 * matches TestimonialsSection and deliberately differs from the
 * clinics section (friendly empty state) and from /blog itself
 * (BlogEmptyState): a homepage teaser for content that doesn't exist
 * is a dead heading over a gap, whereas /blog is a destination someone
 * chose and owes them an explanation.
 *
 * That posture is load-bearing right now, not hypothetical: the
 * blog_posts table isn't in the live DB yet (070 is unapplied), so
 * this section is currently in its failed-fetch path on every render.
 */
export async function BlogTeasers() {
  const posts = await safeFetch<PublicBlogPost[]>(
    () => getPublishedPosts(3),
    []
  );

  if (posts.length === 0) return null;

  return (
    <Section aria-label={BLOG_TEASERS.title} className="bg-[#FFF7F2]">
      <SectionHeading
        eyebrow={BLOG_TEASERS.eyebrow}
        title={BLOG_TEASERS.title}
        intro={BLOG_TEASERS.intro}
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>

      <div className="mt-12">
        <StickerButton href="/blog">
          {BLOG_TEASERS.viewAllLabel}
          <ArrowRight className="size-5" aria-hidden="true" />
        </StickerButton>
      </div>
    </Section>
  );
}
