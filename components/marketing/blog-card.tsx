import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BALL_COLORS, BLOG_CARD, BLOG_INDEX } from "@/lib/marketing/content";
import type { PublicBlogPost } from "@/lib/marketing/blog";
import { formatPostDate } from "@/lib/marketing/blog-shared";

/**
 * Blog sticker card — white fill, thick black outline, hard shadow,
 * same hover lift as ProgramCard. Shared by /blog and the homepage
 * teasers, which is why it lives apart from blog-teasers.tsx: the
 * clinic-card.tsx / holiday-clinics-section.tsx pair sets the
 * precedent (card here, section there).
 *
 * `PublicBlogPost` is a TYPE-only import from the server-only query
 * layer — erased at compile time, so this component carries no
 * service-role chain and stays renderable from anywhere. There are no
 * client hooks here either, matching ClinicCard.
 *
 * Cover images render through a plain <img>, not next/image: the URL is
 * operator-supplied free text (any https:// host passes validation in
 * lib/blog/admin-shared.ts), so next/image's remotePatterns allowlist
 * could never be configured exhaustively without breaking a post the
 * day someone pastes a new host. Cover images are optional and most
 * posts have none — the card is designed to read well without one.
 *
 * Contrast (AA): all text is near-black on white. The date/tag chips
 * use BALL_COLORS pairings, which carry their own verified fg.
 */
export function BlogCard({
  post,
  className,
}: {
  post: PublicBlogPost;
  className?: string;
}) {
  const accent = BALL_COLORS.yellow;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-[#111] bg-white shadow-[4px_4px_0_#111] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_var(--accent)]",
        className
      )}
      style={{ "--accent": accent.color } as React.CSSProperties}
    >
      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover_image_url}
          alt=""
          loading="lazy"
          className="h-48 w-full border-b-2 border-[#111] object-cover"
        />
      )}

      <div className="flex flex-1 flex-col p-7">
        <div className="flex flex-wrap items-center gap-2">
          {post.published_at && (
            <span
              className="inline-block rounded-full border-2 border-[#111] px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: accent.color, color: accent.fg }}
            >
              {formatPostDate(post.published_at)}
            </span>
          )}
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full border-2 border-[#111]/30 px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]/70"
            >
              {tag}
            </span>
          ))}
        </div>

        <h3 className="mt-5 font-heading text-xl font-extrabold tracking-tight text-[#111]">
          {post.title}
        </h3>

        {post.excerpt && (
          <p className="mt-3 line-clamp-3 text-sm font-medium leading-relaxed text-[#1A1A1A]/70">
            {post.excerpt}
          </p>
        )}

        <span className="mt-auto inline-flex min-h-11 items-center gap-2 pt-6 font-heading text-sm font-bold text-[#111]">
          {BLOG_CARD.readMoreLabel}
          <ArrowRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}

/**
 * Shown on /blog when nothing is published. Mirrors ClinicsEmptyState
 * — a dashed sticker outline, never a blank page.
 *
 * The homepage teasers deliberately do NOT use this: an empty blog
 * there renders nothing at all (see BlogTeasers).
 */
export function BlogEmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#111]/40 bg-white px-6 py-14 text-center">
      <p className="font-heading text-xl font-extrabold tracking-tight text-[#111]">
        {BLOG_INDEX.emptyTitle}
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-[#1A1A1A]/70">
        {BLOG_INDEX.emptyBody}
      </p>
    </div>
  );
}
