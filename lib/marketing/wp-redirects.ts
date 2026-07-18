// ============================================================
// WordPress → Next 301 map
// ============================================================
//
// Every entry below was derived from the LIVE WordPress site on
// 15 Jul 2026, not guessed:
//
//   https://buildalphakids.com.au/wp-sitemap.xml  (WP 5.5+ core index)
//     ├── wp-sitemap-posts-post-1.xml        11 blog posts
//     ├── wp-sitemap-posts-page-1.xml        14 pages
//     ├── wp-sitemap-posts-blogs-1.xml        2 "blogs" CPT entries
//     ├── wp-sitemap-taxonomies-category-1.xml 1 category archive
//     └── wp-sitemap-users-1.xml              1 author archive
//
// cross-checked against /wp-json/wp/v2/pages and /wp-json/wp/v2/blogs.
//
// These are the URLs Google has indexed. Getting one wrong silently
// drops a ranking at cutover, so each destination is chosen by what
// the WP page ACTUALLY CONTAINS, not by URL resemblance.
//
// Ordering note: Next matches these top-to-bottom and every source
// here is a literal path (no wildcards) except the WP-cruft block at
// the bottom, whose prefixes (/category, /author, /tag, /feed) match
// no route this app serves. No source can shadow another.

export type WpRedirect = {
  source: string;
  destination: string;
  permanent: true;
};

// ---- Blog posts: WP served these at the ROOT, we serve /blog/<slug> ----
//
// Slugs are preserved EXACTLY, including the trailing "-2" on the
// key-skills post. That "-2" is not a typo to tidy: the abandoned
// "blogs" CPT entry (see BLOGS_CPT_REDIRECTS) already owned the base
// slug, so WordPress suffixed the real post. "-2" is what WP serves
// and what Google indexed, so "-2" is what we keep.
const POST_SLUGS = [
  "the-importance-of-fun-activities-for-schools",
  "build-alpha-kids-approach",
  "skill-improvements-in-children-through-sports",
  "benefits-of-build-alpha-kids-programs-for-schools",
  "key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2",
  "customized-sports-programs-for-schools-tailoring-success",
  "coach-jayden-guiding-students-in-their-physical-education-journey",
  "empowering-students-through-sports-build-alpha-kids-impact-on-schools",
  "beyond-physical-education-build-alpha-kids-unique-approach-to-sports",
  "from-school-to-success-the-journey-with-build-alpha-kids",
  "nurturing-future-leaders-leadership-development-at-build-alpha-kids",
] as const;

const POST_REDIRECTS: WpRedirect[] = POST_SLUGS.map((slug) => ({
  source: `/${slug}`,
  destination: `/blog/${slug}`,
  permanent: true,
}));

// ---- Pages ----
const PAGE_REDIRECTS: WpRedirect[] = [
  // About / contact / blog index — straight renames.
  { source: "/about-us", destination: "/about", permanent: true },
  { source: "/contact-us", destination: "/contact", permanent: true },
  { source: "/blogs", destination: "/blog", permanent: true },

  // "Our Services" was the programs hub → /programs.
  { source: "/our-services", destination: "/programs", permanent: true },

  // "School Programs 1" (/our-services/school-1) is the single biggest
  // page on the old site (~7.5k chars) and covers PRIMARY AND SECONDARY
  // schools together. We split that into two pages, so neither
  // /programs/primary-school nor /programs/high-school alone is a
  // faithful destination — half its meaning would be dropped either
  // way. The hub is the honest match.
  { source: "/our-services/school-1", destination: "/schools", permanent: true },

  // Direct 1:1 service → program matches, confirmed by reading each
  // page's copy (not just its slug).
  { source: "/our-services/childcare", destination: "/programs/childcare", permanent: true },
  { source: "/our-services/primary-school", destination: "/programs/primary-school", permanent: true },
  { source: "/our-services/high-school", destination: "/programs/high-school", permanent: true },
  // Old copy is explicitly about "after-school hours" clinics, i.e. our
  // after-school program — NOT the school-holiday clinics.
  { source: "/our-services/after-school-clinic", destination: "/programs/after-school", permanent: true },

  // Legal pages. These were left UNMAPPED at Task 6.2 — the new site had
  // no privacy or terms page, and a 301 to "/" would have been a soft 404.
  // Task 3.3 built the real pages, so the honest destination now exists and
  // these become straight renames. Short slugs, hence the rename rather than
  // keeping the WP paths.
  { source: "/privacy-policy", destination: "/privacy", permanent: true },
  { source: "/terms-of-use", destination: "/terms", permanent: true },

  // Genuinely valueless: the stock WordPress "Sample Page" (still the
  // default Lorem-ipsum-ish boilerplate) and an empty Elementor
  // "Coming Soon" placeholder with no real copy. Nothing to preserve,
  // so send any stray link equity to the homepage.
  { source: "/sample-page", destination: "/", permanent: true },
  { source: "/coming-soon", destination: "/", permanent: true },
];

// ---- "blogs" custom post type ----
//
// Two entries at /blogs/<slug>. Both are ABANDONED LOREM IPSUM drafts
// (verified via /wp-json/wp/v2/blogs — the body is "Lorem ipsum dolor
// sit amet..."), left published. They were the first cut of the blog
// before the team moved to normal WP posts.
//
// They carry no content worth keeping, but each one's TITLE matches a
// real post exactly, so the topical destination is unambiguous: send
// each to the real post of the same name rather than to /blog. That
// also retires the slug collision that created the "-2" suffix.
const BLOGS_CPT_REDIRECTS: WpRedirect[] = [
  {
    source: "/blogs/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs",
    destination: "/blog/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2",
    permanent: true,
  },
  {
    source: "/blogs/benefits-of-build-alpha-kids-programs-for-schools",
    destination: "/blog/benefits-of-build-alpha-kids-programs-for-schools",
    permanent: true,
  },
];

// ---- WordPress cruft ----
//
// Deliberately NOT a blanket /:path* → / catch-all. A catch-all would
// match every unknown path INCLUDING this app's own portal routes and
// any future page, turning a 404 into a silent homepage redirect and
// breaking the dashboard. Each pattern below is a WP-only namespace
// that this app never serves.
//
// /category/uncategorized is the one indexed archive. It lists posts,
// so /blog is a true like-for-like replacement and keeps any inbound
// link equity pointed at the blog rather than dumping it on the
// homepage. Same logic for the author archive and feeds: they were all
// post listings.
//
// /tag/* is defensive rather than sitemap-derived — WordPress serves
// tag archives on every install even though none are indexed here, and
// no app route can ever collide with the prefix.
const CRUFT_REDIRECTS: WpRedirect[] = [
  { source: "/category/:path*", destination: "/blog", permanent: true },
  { source: "/author/:path*", destination: "/blog", permanent: true },
  { source: "/tag/:path*", destination: "/blog", permanent: true },
  { source: "/feed", destination: "/blog", permanent: true },
  { source: "/comments/feed", destination: "/blog", permanent: true },
];

/**
 * The complete old-WordPress → new-site 301 map.
 *
 * Not included, deliberately:
 *   /wp-content/*, /wp-includes/* — media and asset URLs. Images can
 *     be indexed in their own right; redirecting them to HTML pages
 *     helps nothing.
 */
export const WP_REDIRECTS: WpRedirect[] = [
  ...POST_REDIRECTS,
  ...PAGE_REDIRECTS,
  ...BLOGS_CPT_REDIRECTS,
  ...CRUFT_REDIRECTS,
];
