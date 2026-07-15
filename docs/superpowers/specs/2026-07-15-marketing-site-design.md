# Public Marketing Site — Design Spec

**Date:** 2026-07-15
**Status:** Approved by Jayden (brainstorming session 2026-07-15)
**Replaces:** buildalphakids.com.au (WordPress) — the app becomes the public site

## Purpose

Rebuild buildalphakids.com.au as the public face of bak-app itself. Today `app/page.tsx`
redirects to `/login` and the marketing site is a separate WordPress install with no
booking capability. After this project, the domain serves a fast, bold marketing site
from this repo, and parents flow directly from marketing pages into the existing
parent portal (magic-link login → book → pay with Square → track their kid's progress).
Schools and childcare centres flow into the existing CRM leads pipeline.

**Why this beats competitors:** a competitive review (2026-07-15) of Zing Activ,
Kelly Sports, Ready Steady Go Kids, Australian Sports Camps, and Sydney FC clinics
found that none offer an integrated parent account with booking, payment, and child
progress tracking. They hide pricing (Zing, Kelly), outsource booking (Zing → Catholic
Schools portal, Sydney FC → Jotform), or run generic e-commerce (ASC). Our platform is
the differentiator; the site's job is to sell that loop: *"Book in 60 seconds. Watch
them grow all term."*

## Scope

**In scope:**
- New `app/(marketing)/` route group: homepage, programs (index + 5 pages),
  holiday clinics listing, about, blog (index + post), enquire, contact
- Live data on public pages: clinic cards, stats bar, testimonials
- New `blog_posts` table + admin editor; WordPress post migration
- School/centre enquiry funnel → existing `/api/crm/enquiry` → `leads` + Resend emails
- Newsletter capture → new `newsletter_subscribers` table
- SEO (metadata, JSON-LD, sitemap, WP 301 redirects), performance (static/ISR)
- Launch cutover plan (DNS → Vercel)

**Out of scope (YAGNI):**
- Any change to the parent booking/checkout flow itself (already shipped)
- New payment features, package changes
- CMS beyond a simple blog editor (no page builder)
- Multi-language, dark mode for marketing pages

## Architecture

### Route group

`app/(marketing)/` with its own `layout.tsx` (marketing nav + footer; no dashboard
chrome, no PWA install prompt). Delete the root-redirect `app/page.tsx`; the homepage
moves to `app/(marketing)/page.tsx`.

| Route | Page |
|---|---|
| `/` | Homepage |
| `/programs` | Programs index |
| `/programs/[slug]` | childcare, primary-school, high-school, after-school, holiday-programs |
| `/holiday-clinics` | Live listing of `holiday_clinic` sessions with suburb/sport/week filters |
| `/about` | Story, vision, coach standards |
| `/blog`, `/blog/[slug]` | Blog index + posts |
| `/enquire` | B2B enquiry (schools/centres) |
| `/contact` | Contact details + general form |

### Middleware

Add marketing routes to `PUBLIC_ROUTES` in `middleware.ts` — exact match for `/`,
prefix match for `/programs`, `/holiday-clinics`, `/about`, `/blog`, `/enquire`,
`/contact`. Authenticated users are NOT redirected off marketing pages; the nav
shows "My account" (linking to their role's portal) instead of "Parent login" when
a session exists. **Nav auth state is resolved client-side** (browser Supabase
client in the nav component) so marketing pages stay static/ISR — the server
render always emits the logged-out nav and hydrates to "My account".

### Components

`components/marketing/` — nav, footer, hero, section primitives, clinic card,
program card, testimonial card, stats bar, enquiry form, newsletter form.
Reuse shadcn/ui primitives and the existing Tailwind config.

## Homepage structure (approved wireframe)

1. **Nav** — logo; Programs, Holiday clinics, About, Blog, Contact; "Parent login" + "Book now" CTAs
2. **Hero** — bold orange, real action photo, two CTAs: "Book a holiday clinic" (parents) and "Enquire for your school" (B2B)
3. **Stats bar** (dark) — live from `public_stats_cache` with scroll-triggered count-up
4. **Programs grid** — 5 cards (childcare, primary, high school, after-school, holiday), orange ramp, skewed accents
5. **Upcoming holiday clinics** — live cards, "Book now" each; honest scarcity badges
6. **How it works** — sign in → book → pay → track progress (sells the platform loop)
7. **Testimonials** — from `approved_testimonials`
8. **B2B band** (dark) — "For schools and centres" → `/enquire`
9. **Blog teasers** — 3 latest published posts
10. **Newsletter capture** — inline section (not a popup)
11. **Footer** — contact, socials, ABN, parent login, policies

## Data flow

All public data is read server-side using the established `createSupabaseAdmin()`
pattern from `app/api/public/*`, selecting only public-safe columns. No anon RLS
policy changes needed. Schema changes are limited to two new tables:
`blog_posts` and `newsletter_subscribers`.

### Clinic cards
- Query: `bookable_sessions` where `status = 'open'`, `session_type = 'holiday_clinic'`,
  and `date >= today`, ordered by date. Homepage shows the next N; the
  `/holiday-clinics` page shows all with filters (suburb, sport, week). Other
  session types (`after_school`, `weekend`, `specialist`) remain bookable inside
  the parent portal and are out of scope for public listing.
- Card fields: title, sport, date, start/end time, location name + suburb,
  age range, price (from `price_cents`), spots left (`max_capacity − current_bookings`).
- Badges: "Active Kids vouchers accepted" (site constant), "X spots left" when ≤ 5
  (amber), "Sold out" (grey, CTA becomes "Join waitlist" linking into the parent flow).
- Rendering: ISR, `revalidate = 300`. Booking counts may lag up to 5 minutes;
  the checkout flow remains the source of truth for actual availability.

### Stats bar
- `public_stats_cache` rows (existing refresh endpoint keeps them current).

### Testimonials
- `approved_testimonials` via the existing admin curation flow.

### Blog
- New migration: `blog_posts` (`id`, `slug` unique, `title`, `excerpt`,
  `content` markdown, `cover_image_url`, `status` draft/published, `published_at`,
  `author_name`, `tags text[]`, `seo_title`, `seo_description`, timestamps). RLS:
  admin-only writes; public pages read via the server-side admin client
  (published only).
- Admin editor at `/admin/marketing/blog` (list, create, edit, publish/unpublish;
  markdown textarea with preview — no WYSIWYG).
- Existing WordPress posts migrated as seed data with their original slugs.

### Enquiry funnel (B2B)
- **Reuses the existing `app/api/crm/enquiry/route.ts`** — it already implements
  per-IP rate limiting, lead insert with `source: 'web_form'`, a `lead_activities`
  entry, and staff notification (it was built for the WordPress site to call
  cross-origin). The `/enquire` form POSTs to it same-origin. No duplicate
  enquiry logic; extend the route only where fields are missing.
- Field mapping: contact name/org/suburb/phone/email → existing `leads` columns;
  org type `school`/`childcare_centre` → `type`, "other" → `type = NULL` with the
  detail in `notes`; programs of interest → appended to `notes`; the originating
  program page → `source_detail`.
- Additions to the route: honeypot short-circuit, branded auto-acknowledgement
  email to the enquirer (Resend), dedupe by email+day.
- Failure shows a retry state with the phone number as fallback.
- "Request a quote" CTAs repeat down each program page (Zing pattern), all → `/enquire`
  with the program pre-selected via query param.
- **Post-cutover cleanup:** remove the route's WordPress CORS allowlist once the
  WP site is decommissioned (all callers are then same-origin).

### Newsletter
- New migration: `newsletter_subscribers` (`id`, `email` unique, `status`
  subscribed/unsubscribed, `source_page`, `created_at`). Newsletter emails do NOT
  go into `leads` — `centre_name` is NOT NULL and `type` is a centre enum there,
  and a lone email address doesn't belong in the sales kanban.
- Inline capture form → server action → insert (upsert on email). Same honeypot +
  rate-limit defence as enquiry.
- Nurture: admin views/exports subscribers; automatic `email_sequences` enrolment
  is out of scope (sequences are `trigger_stage`-based and centre-oriented).

### Book now
- Clinic CTAs link to `/parent/book/[sessionId]`. Builds on the **existing
  validated `next` param in `app/auth/callback/route.ts`** (`safeNext()`):
  `parent-login` accepts `next`, passes it through `signInWithOtp`'s
  `emailRedirectTo`, and the callback already handles the rest. No parallel
  redirect mechanism.

## Visual system — "bold and energetic" (approved direction)

- **Palette:** brand orange `#E8712A` dominant (heroes, CTAs), near-black `#1A1A1A`
  (stats bar, B2B band, footer), warm cream `#FFF7F2` section tints, orange ramp on
  program cards (light → deep).
- **Type:** existing fonts — Bricolage Grotesque headings (oversized, up to ~72px
  desktop hero via clamp), DM Sans body. No new font loads.
- **Energy:** subtle skew on card rows, count-up stats on scroll, hover lift on
  clinic cards. CSS + one small IntersectionObserver — no animation libraries.
- **Photography:** real action shots only (from existing WP media + program
  galleries). Placeholder note: Jayden to supply best 10–15 photos; layout must not
  depend on exact aspect ratios.
- **Australian English** throughout (existing convention).

## SEO & performance

- Per-page `metadata` (title, description, OG image); `sitemap.xml` and `robots.txt`
  route handlers.
- JSON-LD: `LocalBusiness` site-wide, `Event` per open holiday clinic,
  `Article` per blog post.
- 301 redirects for old WordPress URLs (blog slugs, `/about-us`, service pages)
  in `next.config.ts` `redirects()` — redirect map built from the live WP sitemap
  before cutover.
- Marketing pages static/ISR; images via `next/image`; target Lighthouse ≥ 95.

## Launch cutover

1. Ship marketing pages in the normal deploy (live on the vercel.app domain;
   old domain still on WordPress).
2. QA pass on the Vercel URL (booking flow end-to-end, forms, redirects, mobile).
3. Point buildalphakids.com.au DNS at Vercel. WordPress kept as an archive
   (hosting untouched) until confident, then decommissioned.
4. Post-cutover: verify Search Console, submit sitemap, spot-check top WP URLs 301.

## Error handling

- Public data fetch failure → last ISR-cached page serves (never a broken hero);
  clinic section renders a "call us" fallback if the cache is empty on first build.
- Form submissions: validation errors inline; server failure → retry message with
  phone fallback; duplicate submissions deduped by email+day in the action.
- Middleware changes must not alter any existing portal behaviour (regression
  matrix below).

## Testing

Vitest (repo conventions — no E2E harness exists in this repo, so coverage is
unit/integration plus a manual QA checklist):
- Enquiry route: validation (rejects bad payloads), happy path (lead inserted,
  emails triggered), honeypot short-circuit, rate limit, email+day dedupe,
  field mapping (org type "other" → NULL + notes).
- Newsletter action: validation, upsert-on-email, honeypot.
- Clinic query helper: filters `open` + `holiday_clinic` + future only;
  spots-left arithmetic; sold-out flag.
- Blog: only `published` posts appear publicly; draft slugs 404.
- Middleware matrix: marketing routes public (anon 200), portal routes still
  gated (anon → login), authed parent on `/` not redirected.
- Parent-login: `next` param passed through to `emailRedirectTo` and rejected
  when not a same-origin path (reuses `safeNext` semantics).

Manual QA checklist (cutover gate, on the Vercel URL):
- Home → clinic "Book now" → parent-login → magic link → lands on
  `/parent/book/[id]` → Square sandbox payment completes.
- Enquiry form submit → lead visible in admin CRM → both emails received.
- Newsletter signup, blog post render, all WP 301 redirects, mobile pass,
  Lighthouse ≥ 95.

## Rollout order (implementation phases)

1. Route group scaffold + middleware + nav/footer + homepage with static copy
2. Live data sections (clinics, stats, testimonials) + holiday-clinics page
3. Program pages + about + contact
4. Enquiry funnel + newsletter (server actions, emails, CRM)
5. Blog (migration, admin editor, public pages, WP post import)
6. SEO layer + redirects + performance pass
7. QA + cutover
