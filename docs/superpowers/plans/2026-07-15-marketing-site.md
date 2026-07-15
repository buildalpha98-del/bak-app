# Public Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WordPress buildalphakids.com.au with a public marketing site served by bak-app itself, flowing parents into the existing booking funnel and schools into the existing CRM.

**Architecture:** New `app/(marketing)/` route group (homepage + 10 public pages) with its own layout. Public data (clinics, stats, testimonials, blog) is read server-side via `createSupabaseAdmin()` selecting public-safe columns, rendered static/ISR. Two new tables (`blog_posts`, `newsletter_subscribers`); everything else reuses shipped infrastructure (enquiry route, auth callback `next` param, parent booking flow).

**Tech Stack:** Next.js 16 App Router + React 19 (**`params`/`searchParams` are Promises in server components — always `await` them**; in client components use `useSearchParams()`), Tailwind v4 (`--brand-orange: #E8712A`, orange `--primary` already tokenised), shadcn/ui, Supabase, Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-marketing-site-design.md` — read it before starting. Design direction: **bold and energetic** (orange-dominant heroes, oversized Bricolage Grotesque headings, cream `#FFF7F2` tints, near-black `#1A1A1A` bands, subtle skews).

**Accessibility convention (established Task 1.3 review):** white text on brand orange `#E8712A` is ~3.1:1 — FAILS WCAG AA at button sizes. On orange fills use near-black `#1A1A1A` text (~5.8:1, passes). On white/cream, orange TEXT is only for large headings (≥24px) — for small text/hover states use `#993C1D` (~6.9:1). On orange hero backgrounds, white text is fine at heading sizes (≥24px) only; body text on orange should be `#1A1A1A` or cream panels.

**Conventions (from repo + user standards):**
- Australian English in all copy. Brand name is always "Build Alpha Kids", never abbreviated.
- Tests colocated in `__tests__/` dirs, Vitest, factory helpers in `tests/factories.ts`.
- Never write `sessions.coach_id` directly (CI guard) — not relevant here but do not touch roster code.
- Commit after every green test cycle. Run `npx vitest run <file>` for the file under test, full `npx vitest run` before each commit.

---

## File Structure (whole project)

```
app/(marketing)/
  layout.tsx                     — marketing chrome (nav + footer), metadata defaults
  page.tsx                       — homepage
  programs/page.tsx              — programs index
  programs/[slug]/page.tsx       — 5 program pages (static content map)
  holiday-clinics/page.tsx       — live clinic listing + filters
  about/page.tsx
  blog/page.tsx                  — published posts index
  blog/[slug]/page.tsx           — post page
  enquire/page.tsx               — B2B enquiry form
  contact/page.tsx
components/marketing/
  nav.tsx                        — client component (auth-aware CTA swap)
  footer.tsx
  hero.tsx                       — homepage hero
  section.tsx                    — shared section primitives (Section, SectionHeading, SkewCard)
  stats-bar.tsx                  — count-up stats (client)
  program-card.tsx
  clinic-card.tsx
  testimonial-card.tsx
  how-it-works.tsx
  b2b-band.tsx
  blog-teasers.tsx
  newsletter-form.tsx            — client form → server action
  enquiry-form.tsx               — client form → POST /api/crm/enquiry
lib/marketing/
  clinics.ts                     — getOpenHolidayClinics() + pure availability logic
  content.ts                     — program page content map, site constants (phone, email, socials)
  blog.ts                        — getPublishedPosts(), getPostBySlug()
  newsletter.ts                  — subscribeToNewsletter server action
  jsonld.ts                      — LocalBusiness / Event / Article builders
  __tests__/clinics.test.ts
  __tests__/newsletter.test.ts
  __tests__/blog.test.ts
app/api/crm/enquiry/route.ts     — MODIFY: self-origin CORS, honeypot, auto-ack, dedupe, "other" type
app/api/crm/enquiry/__tests__/route.test.ts
lib/parent/actions.ts            — MODIFY: sendParentMagicLink(email, next?)
app/(auth)/parent-login/page.tsx — MODIFY: read ?next=, pass through
app/(dashboard)/admin/marketing/blog/page.tsx        — blog admin list
app/(dashboard)/admin/marketing/blog/[id]/page.tsx   — blog editor
lib/blog/admin-actions.ts        — create/update/publish actions (admin)
supabase/migrations/069_blog_posts.sql
supabase/migrations/070_newsletter_subscribers.sql
scripts/import-wp-posts.mjs      — one-off WP content import
middleware.ts                    — MODIFY: PUBLIC_ROUTES additions
app/page.tsx                     — DELETE (replaced by (marketing)/page.tsx)
app/sitemap.ts, app/robots.ts    — SEO
next.config.ts                   — MODIFY: WP 301 redirects
middleware __tests__: lib/marketing/__tests__/public-routes.test.ts (pure matcher extraction)
```

---

## Chunk 1: Foundation — route group, middleware, chrome, homepage shell

### Task 1.1: Middleware public routes

**Files:**
- Modify: `middleware.ts:5-16` (PUBLIC_ROUTES)
- Create: `lib/marketing/public-routes.ts` (extract list + matcher so it's unit-testable)
- Test: `lib/marketing/__tests__/public-routes.test.ts`

The middleware matches `pathname === route || pathname.startsWith(route + "/")`. Note `"/"` therefore matches ONLY the homepage exactly (`"/" + "/"` = `"//"` never matches) — this is the behaviour we want.

- [ ] **Step 1: Write the failing test**

```ts
// lib/marketing/__tests__/public-routes.test.ts
import { describe, it, expect } from "vitest";
import { isPublicRoute } from "../public-routes";

describe("isPublicRoute", () => {
  it.each([
    "/", "/programs", "/programs/childcare", "/holiday-clinics",
    "/about", "/blog", "/blog/some-post", "/enquire", "/contact",
    "/login", "/parent-login", "/refer/abc",
  ])("allows %s", (p) => expect(isPublicRoute(p)).toBe(true));

  it.each([
    "/admin", "/parent", "/parent/book", "/ops", "/coach",
    "/client/some-centre", "/programsfoo", // prefix must not bleed
  ])("gates %s", (p) => expect(isPublicRoute(p)).toBe(false));
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `npx vitest run lib/marketing/__tests__/public-routes.test.ts`

- [ ] **Step 3: Implement**

```ts
// lib/marketing/public-routes.ts
// Single source of truth for unauthenticated-accessible paths.
// Matching: exact, or prefix + "/" — so "/" matches only the homepage.
export const PUBLIC_ROUTES = [
  "/",
  "/programs",
  "/holiday-clinics",
  "/about",
  "/blog",
  "/enquire",
  "/contact",
  "/login",
  "/client-login",
  "/parent-login",
  "/reset-password",
  "/update-password",
  "/auth/callback",
  "/feedback",
  "/refer",
  "/client/shared",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}
```

- [ ] **Step 4: Wire middleware to it** — in `middleware.ts` delete the inline `PUBLIC_ROUTES` array and the inline `isPublicRoute` computation (line ~125); `import { isPublicRoute } from "@/lib/marketing/public-routes"` and use `const publicRoute = isPublicRoute(pathname)` at the same spot (rename local usages). Keep everything else identical — do NOT touch the client/parent/staff gating blocks.

- [ ] **Step 5: Run full suite + typecheck** — `npx vitest run && npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 6: Commit** — `feat(marketing): public route matcher + middleware wiring`

### Task 1.2: Site constants and content module

**Files:**
- Create: `lib/marketing/content.ts`

No test (static data). Contains: `SITE` (name, phone, email, ABN, socials, booking URL constants), `PROGRAMS` array — one entry per program page with `slug`, `title`, `tagline`, `description` paragraphs, `ages`, `highlights[]`, `heroImage`. Slugs: `childcare`, `primary-school`, `high-school`, `after-school`, `holiday-programs`. Copy: adapt from the current WordPress site's five service descriptions (in spec's Purpose section context); tone bold/energetic, Australian English. Include `ACTIVE_KIDS_BLURB = "NSW Active Kids vouchers accepted"`.

- [ ] Write the module, `npx tsc --noEmit`, commit `feat(marketing): site constants and program content`.

### Task 1.3: Marketing layout — nav + footer

**Files:**
- Create: `components/marketing/nav.tsx`, `components/marketing/footer.tsx`, `app/(marketing)/layout.tsx`

Nav is a client component. **Auth state resolves client-side so pages stay static**: render logged-out nav on the server, hydrate to "My account" if a session exists.

```tsx
// components/marketing/nav.tsx (essentials)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/programs", label: "Programs" },
  { href: "/holiday-clinics", label: "Holiday clinics" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export function MarketingNav() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => setSignedIn(!!data.session));
  }, []);
  // sticky header, logo left, links centre, right: (signedIn ? "My account" → /parent : "Parent login" → /parent-login)
  // + solid orange "Book now" → /holiday-clinics. Mobile: sheet menu (reuse components/ui/sheet).
}
```

(Verify the browser client helper name with `ls lib/supabase/` — use whatever exists, e.g. `client.ts` export.)

Footer (server component): dark `#1A1A1A`, columns — programs links, contact (phone/email from `SITE`), socials, ABN, "Parent login", policy links. Layout:

```tsx
// app/(marketing)/layout.tsx
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1A1A1A]">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
```

- [ ] Build nav, footer, layout. `npm run build` must pass. Commit `feat(marketing): layout, nav, footer`.

### Task 1.4: Homepage shell with static sections

**Files:**
- Delete: `app/page.tsx` (the `redirect("/login")`)
- Create: `app/(marketing)/page.tsx`, `components/marketing/hero.tsx`, `components/marketing/section.tsx`, `components/marketing/program-card.tsx`, `components/marketing/how-it-works.tsx`, `components/marketing/b2b-band.tsx`

Homepage renders sections in the approved order (spec "Homepage structure"). This task ships sections 1, 2, 4, 6, 8, 11 with static content; live-data sections land later with graceful empty states (3 stats + 5 clinics + 7 testimonials in Chunk 2, 9 blog teasers in Chunk 5, 10 newsletter in Chunk 4).

Hero copy (approved direction):
- H1: `Where kids build skills for life` (oversized, clamp 40→72px, Bricolage Grotesque)
- Sub: `Multi-sport coaching across South-West Sydney childcare centres, schools and holiday clinics. Book online in 60 seconds — then watch them grow all term.`
- CTAs: primary white-on-orange `Book a holiday clinic` → `/holiday-clinics`; secondary outline `Enquire for your school` → `/enquire`
- Full-bleed orange `#E8712A` background, real action photo right (from `public/`, add `TODO-photo` placeholder path constants in `lib/marketing/content.ts` so swapping images is one-line)

How-it-works (4 steps): Sign in with just your email (magic link — no passwords) → Book and pay online in 60 seconds (Square; Active Kids vouchers accepted) → They play, learn and grow with qualified coaches → Track skills and progress in your parent account all term.

- [ ] Build all components + page. `npm run build` passes. Manually verify `/` renders and `/admin` still redirects to login: `npm run dev`, check both.
- [ ] Run full suite: middleware still green (`npx vitest run`).
- [ ] Commit `feat(marketing): homepage shell replaces root login redirect`

### Task 1.5: Brand revamp — "court orange, loud" (added 2026-07-15 after Jayden's review)

**Jayden's feedback on the Chunk-1 site:** UI "boring / looks very AI based"; copy missing "the actual sports, what we do, our impact"; priority is "the layout and what's on the homepage" (deep copy pass deferred).

**Approved direction:** Court orange (loud) — keep the orange hero but layer the REAL brand: badge crest logo, illustrated ball-row artwork, yellow accents, thick black outlines, hard "sticker" shadows.

**Assets (already in repo at `public/images/brand/`):** `logo.svg` (278KB optimised crest; also `logo.png`), `balls-row.svg` + `balls-row-alt.svg` (the t-shirt ball illustrations, ~96KB each). Brand palette from the logo: orange `#E8712A`, yellow `#FFD23F` (banner outline), black `#111`, ball colours green `#7BC043`, red `#D8342C`, blue `#2D6FB5`. AA convention still applies (black text on orange/yellow fills; `#993C1D` for small orange-ish text on light).

**Files:**
- Modify: `components/marketing/{nav,footer,hero,program-card,how-it-works,b2b-band,section}.tsx`, `app/(marketing)/page.tsx`, `lib/marketing/content.ts`
- Create: `components/marketing/sports-strip.tsx`, `components/marketing/what-we-do.tsx`

**Changes:**
1. **Nav + footer**: real `logo.png`/`logo.svg` replaces the text wordmark (height ~48px nav, ~72px footer; keep alt text "Build Alpha Kids"). "Book now" CTA becomes sticker-style: `bg-[#FFD23F] text-[#111] border-2 border-[#111]` with hard shadow (`shadow-[3px_3px_0_#111]`), hover translates 1px.
2. **Hero (court orange, loud)**: keep orange full-bleed + approved H1/sub, but: yellow sticker eyebrow badge (rotated ~-2°), H1 stays white with black marker underline, CTAs become sticker-style (primary yellow, secondary white outline→white bg black border), and the decorative geometric panel is REPLACED by the badge crest logo large + the `balls-row.svg` strip breaking out of the hero's bottom edge. Subtle court-line white arcs in the background (CSS/SVG, low opacity).
3. **NEW sports strip** (directly under hero): "One club. Six sports." — the six sports NAMED (Soccer, Basketball, Cricket, Tennis, Volleyball, Rugby) as sticker chips with ball-colour dots/segments of the balls-row art. Add `SPORTS` array to `lib/marketing/content.ts` (name + brand colour each).
4. **NEW what-we-do section** (replaces the bare programs-grid heading): three concrete pillars — "In childcare centres" / "In schools" / "Holiday clinics" — each 2-3 sentences of concrete copy (what a session looks like, who runs it, how parents/coordinators engage), each linking to the relevant program page or /holiday-clinics. The 5-card programs grid stays below but restyled with black outlines + sticker shadows and the ball-colour palette instead of the orange-only ramp.
5. **Impact placeholder**: dark band retitled "Our impact" with 3 static sticker-style stat placeholders labelled clearly (real numbers arrive with Task 2.3's live stats — keep the same component API so 2.3 swaps data in, not markup).
6. **How-it-works + B2B band**: restyle to match (sticker numbers, yellow accents on dark).
7. Fold in Task 1.4 review minors: delete `program-card.tsx` dead `deepCard` branch; soften `content.ts` header comment ("shared/reused copy and constants"); correct hero.tsx stale 5.8:1 comment to 5.66:1.
8. Homepage order becomes: hero → sports strip → what we do → programs grid → [stats live] → [clinics live] → how-it-works → [testimonials live] → B2B → [blog] → [newsletter] → footer. Keep all Chunk 2/4/5 insertion comments intact.

Verification: `npm run build` (/ static), `npx vitest run` (903), `npx tsc --noEmit`, dev-server screenshot check desktop + mobile, AA contrast check on all new pairings. Commit `feat(marketing): court-orange brand revamp — real logo, ball art, sports strip, what-we-do`.

Later UI tasks (2.2 cards, 2.3 stats/testimonials, 3.x pages, 4.x forms) MUST follow this design language: sticker outlines/shadows, brand palette, ball-art accents.

## Chunk 2: Live data — clinics, stats, testimonials, book-now redirect

### Task 2.1: Clinic query helper (pure logic first)

**Files:**
- Create: `lib/marketing/clinics.ts`
- Test: `lib/marketing/__tests__/clinics.test.ts`

- [ ] **Step 1: Failing tests for the pure parts**

```ts
import { describe, it, expect } from "vitest";
import { clinicAvailability, clinicIsListable } from "../clinics";

describe("clinicAvailability", () => {
  it("computes spots left", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 17 }))
      .toEqual({ spotsLeft: 3, soldOut: false, lowSpots: true }));
  it("flags sold out at zero", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 20 }).soldOut).toBe(true));
  it("never returns negative spots", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 25 }).spotsLeft).toBe(0));
  it("lowSpots only at 5 or fewer", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 14 }).lowSpots).toBe(false));
});

describe("clinicIsListable (booking window)", () => {
  const now = new Date("2026-07-15T02:00:00Z");
  it("passes when both windows null", () =>
    expect(clinicIsListable({ booking_opens_at: null, booking_closes_at: null }, now)).toBe(true));
  it("excludes before opens_at", () =>
    expect(clinicIsListable({ booking_opens_at: "2026-08-01T00:00:00Z", booking_closes_at: null }, now)).toBe(false));
  it("excludes after closes_at", () =>
    expect(clinicIsListable({ booking_opens_at: null, booking_closes_at: "2026-07-01T00:00:00Z" }, now)).toBe(false));
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run lib/marketing/__tests__/clinics.test.ts`

- [ ] **Step 3: Implement**

```ts
// lib/marketing/clinics.ts
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type PublicClinic = {
  id: string; title: string; sport: string | null; date: string;
  start_time: string; end_time: string; location_name: string | null;
  suburb: string; age_group_min: number | null; age_group_max: number | null;
  price_cents: number; max_capacity: number; current_bookings: number;
  booking_opens_at: string | null; booking_closes_at: string | null;
};

export function clinicAvailability(c: Pick<PublicClinic, "max_capacity" | "current_bookings">) {
  const spotsLeft = Math.max(0, c.max_capacity - c.current_bookings);
  return { spotsLeft, soldOut: spotsLeft === 0, lowSpots: spotsLeft > 0 && spotsLeft <= 5 };
}

export function clinicIsListable(
  c: Pick<PublicClinic, "booking_opens_at" | "booking_closes_at">, now: Date
): boolean {
  if (c.booking_opens_at && new Date(c.booking_opens_at) > now) return false;
  if (c.booking_closes_at && new Date(c.booking_closes_at) <= now) return false;
  return true;
}

const PUBLIC_COLUMNS =
  "id, title, sport, date, start_time, end_time, location_name, suburb, age_group_min, age_group_max, price_cents, max_capacity, current_bookings, booking_opens_at, booking_closes_at";

export async function getOpenHolidayClinics(limit?: number): Promise<PublicClinic[]> {
  const supabase = createSupabaseAdmin();
  const today = sydneyTodayIso(); // from @/lib/utils/sydney-time — NEVER new Date().toISOString().slice(0,10): UTC is yesterday's Sydney date until ~10-11am AEST daily
  let query = supabase
    .from("bookable_sessions")
    .select(PUBLIC_COLUMNS)
    .eq("status", "open")
    .eq("session_type", "holiday_clinic")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (limit) query = query.limit(limit * 2); // headroom: window filter may drop some
  const { data, error } = await query;
  if (error) throw error;
  const now = new Date();
  const listable = (data ?? []).filter((c) => clinicIsListable(c, now));
  return limit ? listable.slice(0, limit) : listable;
}
```

- [ ] **Step 4: Run — PASS.** Then full suite. Commit `feat(marketing): clinic query helper with availability + booking-window logic`.

### Task 2.2: Clinic card + homepage section + /holiday-clinics page

**Files:**
- Create: `components/marketing/clinic-card.tsx`, `app/(marketing)/holiday-clinics/page.tsx`
- Modify: `app/(marketing)/page.tsx` (insert live section 5)

Card fields per spec: title, sport, formatted date ("Mon 21 Jul"), time range, location + suburb, ages ("Ages 5–12"), price (`(price_cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" })`), badges: `Active Kids vouchers accepted` always; `X spots left` amber when `lowSpots`; `Sold out` grey + CTA becomes outline `Join waitlist` → same booking URL. CTA: `Book now` → `/parent/book/${id}`.

Pages: `export const revalidate = 300;` on both homepage and `/holiday-clinics`. Homepage shows `getOpenHolidayClinics(4)`; listing page all, with client-side filters (suburb select, sport select, week grouping — filter in-page over the server-fetched array, no extra queries) in a dedicated client component `components/marketing/clinic-filters.tsx` that receives the fetched array as props (keeps the page file a small server component). Empty state: "New clinic dates drop soon — call us on {SITE.phone} or check back shortly." Wrap the section's data fetch in try/catch → render empty state on error (never a broken hero, per spec).

- [ ] Build; `npm run build`; dev-verify both pages with real data (if DB empty locally, temporarily verify empty state renders). Commit `feat(marketing): live holiday clinic cards + listing page`.

### Task 2.3: Stats bar + testimonials

**Files:**
- Create: `components/marketing/stats-bar.tsx`, `components/marketing/testimonial-card.tsx`
- Modify: `app/(marketing)/page.tsx`

Stats: server fetch from `public_stats_cache` (same admin-client pattern). Actual `stat_key` values: `total_sessions_all_time`, `sessions_this_term`, `centre_count`, `sport_count`, `average_rating`, `total_children`. Pick four for the bar — suggested: `total_children` ("kids coached"), `centre_count` ("centres and schools"), `sport_count` ("sports offered"), `sessions_this_term` ("sessions this term"). Dark band, numbers count up on scroll — client component receiving final values as props, one `IntersectionObserver`, no libraries. Testimonials: fetch `approved_testimonials` (reuse column names from `app/api/public/testimonials/route.ts`), render 2–4 cards. Failure posture (confirmed 2026-07-15): testimonials — fetch failure or empty → section renders nothing (return null). Impact/stats band — stays VISIBLE with em-dash placeholder values on failure (the band is core page structure; vanishing it would reflow the page). Homepage never breaks either way.

**Band stat selection (owner decision, 2026-07-15):** the `children` roster table is empty — ops runs headcount-only, so there are no per-child records and `total_children` would publish as a permanent em-dash. Jayden's call: **drop `total_children` from the band and use `total_sessions_all_time` ("Sessions delivered") in that slot** — real (11 as of 2026-07-15) and grows over time. Final four: `total_sessions_all_time`, `centre_count`, `sport_count`, `sessions_this_term`. Do NOT substitute a proxy (e.g. summed centre `group_size`) for a kids count — that publishes contracted capacity as if it were children coached.

**Owner-confirmed facts (2026-07-15)** — sourced by Jayden directly, not from repo copy; treat as authoritative:
- NSW Active Kids vouchers apply to **both after-school clinics and holiday clinics** (so the Active Kids badge/mention is correct on both program pages, not just holiday).
- **Childcare sessions are EYLF-aligned.** Australian childcare runs the Early Years Learning Framework, not a "curriculum" — childcare copy must say EYLF (not "curriculum-friendly", which is school-only language). Jayden confirmed the EYLF claim is accurate for Build Alpha Kids' childcare session plans; it was flagged to him as a strong claim that centre directors may ask him to substantiate, and he affirmed it. Schools copy keeps "curriculum-aligned"/"curriculum-friendly" — do NOT say EYLF for school programs, or curriculum for childcare.

- [ ] Build + verify + full suite. Commit `feat(marketing): live stats bar and testimonials`.

### Task 2.4: Book-now redirect (parent-login `next` param)

**Files:**
- Modify: `lib/parent/actions.ts:39-58` (`sendParentMagicLink`), `app/(auth)/parent-login/page.tsx`
- Test: `lib/parent/__tests__/magic-link-next.test.ts`

`safeNext()` already guards the callback side. Login side changes:

```ts
// lib/parent/actions.ts — signature change
export async function sendParentMagicLink(
  email: string,
  next?: string
): Promise<{ error: string | null }> {
  // Only same-origin /parent paths may override the default target.
  const safe = next && (next.startsWith("/parent/") || next === "/parent")
    ? next
    : "/parent-login"; // matches middleware isParentRoute semantics; excludes // and /parents-*
  // ...
  emailRedirectTo: getAuthCallbackUrl(safe),
```

`parent-login/page.tsx` is a `"use client"` page with the form INLINE (the `sendParentMagicLink(email)` call is at line ~25 — there is no separate form component): read `next` via `useSearchParams()` and pass it as the second arg. Also update the existing authed-user redirect in `middleware.ts:234-244`: when an authenticated parent hits `/parent-login?next=/parent/...`, redirect to the `next` value instead of bare `/parent` (same guard).

- [ ] **Step 1: Failing test** — extract the safe-target logic into `lib/parent/safe-next.ts` (`parentSafeNext(raw?: string): string`) so it's testable pure; test: `/parent/book/abc` and `/parent` pass through; `undefined`, `https://evil.com`, `//evil`, `/admin`, `/parents-hack` all → `/parent-login`.
- [ ] **Step 2-4: Implement, PASS, wire both callers** (action + middleware).
- [ ] **Step 5: Manual verify** — dev server: visit `/parent/book/x` logged out → redirected to `/parent-login`… note the CURRENT middleware redirect (lines 199-204) drops the original path; update it to send `?next=<pathname>` when the target is a parent route so the whole loop closes. Careful: `request.nextUrl.clone()` preserves the ORIGINAL query string — set `loginUrl.search = ""` then `loginUrl.searchParams.set("next", pathname)` deliberately.
- [ ] Full suite + commit `feat(parent): carry booking destination through magic-link login`.

## Chunk 3: Program pages, about, contact

### Task 3.1: Programs index + [slug] pages

**Files:**
- Create: `app/(marketing)/programs/page.tsx`, `app/(marketing)/programs/[slug]/page.tsx`

`generateStaticParams` from `PROGRAMS` in `lib/marketing/content.ts`. Each program page: bold hero (title, tagline, photo), highlights grid, description, trust strip (WWCC, first-aid certified coaches, curriculum-aligned where relevant), **"Request a quote" CTA repeated top / middle / bottom** (Zing pattern) → `/enquire?program=<slug>`. `holiday-programs` page additionally embeds the live clinic cards (reuse Task 2.2 component, limit 6). Unknown slug → `notFound()`.

- [ ] Build, verify all 5 slugs render + 404 case, commit `feat(marketing): program pages`.

### Task 3.2: About + contact

**Files:**
- Create: `app/(marketing)/about/page.tsx`, `app/(marketing)/contact/page.tsx`

About: story/mission (adapt current WP "Growing stronger, together" copy, bolder voice), coach standards section (WWCC, first aid, tenure), stats reuse. Contact: phone/email/service area cards from `SITE`, plus a slim general-contact form that posts to the enquiry route with `type: "other"` context — reuse `enquiry-form.tsx` (Chunk 4) in "contact" mode; if Chunk 4 not yet done, ship contact page with mailto/phone links only and add the form in Task 4.2.

- [ ] Build, verify, commit `feat(marketing): about and contact pages`.

## Chunk 4: Funnels — enquiry + newsletter

### Task 4.1: Enquiry route hardening

**Files:**
- Modify: `app/api/crm/enquiry/route.ts`
- Test: `app/api/crm/enquiry/__tests__/route.test.ts`

Changes (each from the spec, all covered by tests):
1. **Self-origin CORS**: build `allowedOrigins` as the existing WP list **plus** `getBaseUrl()` and (when set) `https://${process.env.VERCEL_URL}`. Same-origin browser POSTs then pass during vercel.app QA. Keep WP entries until decommission. The route currently duplicates the allowlist in the `POST` and `OPTIONS` handlers (lines 28-32 and 133-137) — extract ONE module-level `getAllowedOrigins()` and use it in both, or the lists will diverge.
2. **Honeypot**: accept optional `website` field (hidden input named `website`); if non-empty, return `{ success: true }` WITHOUT inserting (silent discard).
3. **"other" org type**: `type === "school" ? "school" : type === "other" ? null : "childcare_centre"`; when null, prepend `Org type: other.` to `notes`.
4. **New optional fields**: `suburb` → `leads.suburb`; `programs_of_interest` (string[]) → appended to `notes`; `source_page` → `leads.source_detail`.
5. **Dedupe**: before insert, select `leads` where `contact_email` matches and `created_at >= today` (Sydney day is fine at this granularity — reuse `lib/utils/sydney-time` helpers if exported); on hit, skip insert/notify and return success with `deduped: true`.
6. **Auto-acknowledgement**: after lead insert, send branded email to `contact_email` using the existing `sendEmail(to, subject, html, emailType)` helper in `lib/email/send.ts` (non-throwing, audit-logged — exactly the "failure must not fail the request" behaviour needed) with a template following `lib/email/templates.ts` patterns — subject: `Thanks for your enquiry — Build Alpha Kids`.

Tests (mock `createSupabaseAdmin`, `triggerNotification`, and the Resend helper with `vi.mock`; use input-based `mockImplementation` routing, never `mockResolvedValueOnce` chains; clear the module-level rate-limit map between tests by `vi.resetModules()` + dynamic import):
- 400 when email missing; 400 when centre_name missing
- happy path: lead inserted with `source: 'web_form'`, activity written, staff notified, ack email sent, 200
- honeypot filled → 200, zero inserts
- `type: "other"` → insert has `type: null`, notes prefixed
- dedupe: existing same-email lead today → 200 `deduped`, zero inserts
- 403 for disallowed origin; 200 for the self origin — set `NEXT_PUBLIC_SITE_URL=https://qa-preview.example.com` in the test (via `vi.stubEnv`) and send that as `Origin`, since `getBaseUrl()`'s localhost fallback is already allowlisted and would pass against unmodified code; 429 after 11th request same IP

- [ ] Write failing tests → run (FAIL) → implement → run (PASS) → full suite → commit `feat(crm): harden enquiry route for same-origin marketing form`.

### Task 4.2: Enquiry page + form

**Files:**
- Create: `components/marketing/enquiry-form.tsx`, `app/(marketing)/enquire/page.tsx`
- Modify: `app/(marketing)/contact/page.tsx` (embed form in contact mode)

Client form: org name, contact name, email, phone, suburb, org type (school / childcare centre / other), programs of interest (checkboxes from `PROGRAMS`), message, hidden `website` honeypot, `source_page` auto-filled from `?program=` param. POST to `/api/crm/enquiry` with `fetch`; pending state; success panel ("We'll be in touch within one business day"); failure panel with retry + `SITE.phone` fallback. Pre-select program from `?program=` query.

- [ ] Build + dev-verify a real submission end-to-end against local Supabase (lead appears in admin CRM). Commit `feat(marketing): enquiry funnel page`.

### Task 4.3: Newsletter

**Files:**
- Create: `supabase/migrations/069_newsletter_subscribers.sql`, `lib/marketing/newsletter.ts`, `components/marketing/newsletter-form.tsx`
- Test: `lib/marketing/__tests__/newsletter.test.ts`
- Modify: `app/(marketing)/page.tsx` (section 10)

(Migration numbering matches chunk order: 069 here in Chunk 4, 070 for blog in Chunk 5 — if you execute Chunk 5 first, that's fine, `supabase db push` applies whatever exists; just never renumber an already-pushed migration.)

```sql
-- 069_newsletter_subscribers.sql
CREATE TABLE newsletter_subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  source_page text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- No public policies: all access via service role (server actions / admin pages).
CREATE TRIGGER newsletter_subscribers_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

`subscribeToNewsletter(formData)` server action: zod email validation, honeypot check, per-call rate limit reuse (same in-memory pattern), upsert on email (re-subscribe sets status back to subscribed). Tests: invalid email rejected, honeypot silently succeeds without insert, upsert called with normalised (lowercased/trimmed) email.

- [ ] TDD cycle as above; apply migration to local/branch DB per repo workflow (check `supabase/` README or existing practice — likely `npx supabase db push` locally or migration applied on deploy); full suite; commit `feat(marketing): newsletter capture`.

### Task 4.4: Admin subscribers view + CSV export

**Files:**
- Create: `app/(dashboard)/admin/marketing/subscribers/page.tsx`, `app/api/admin/subscribers/export/route.ts`

Spec §Newsletter requires "admin views/exports subscribers". Minimal surface: a table (email, status, source_page, created_at, newest first) following the `/admin/marketing/testimonials` page structure, plus an "Export CSV" button hitting the export route (admin-authed per existing admin API route conventions — copy the auth guard from a neighbouring `app/api/admin/*` route) that streams `email,status,source_page,created_at` rows.

- [ ] Build page + route, verify in dev (subscribe via the homepage form, see the row, download CSV), commit `feat(marketing): admin subscriber list + CSV export`.

## Chunk 5: Blog

### Task 5.1: blog_posts migration + query lib

**Files:**
- Create: `supabase/migrations/070_blog_posts.sql`, `lib/marketing/blog.ts`
- Test: `lib/marketing/__tests__/blog.test.ts`

```sql
-- 070_blog_posts.sql
CREATE TABLE blog_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  excerpt         text,
  content         text NOT NULL DEFAULT '',
  cover_image_url text,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at    timestamptz,
  author_name     text NOT NULL DEFAULT 'Build Alpha Kids',
  tags            text[] NOT NULL DEFAULT '{}',
  seo_title       text,
  seo_description text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_admin_all ON blog_posts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE INDEX idx_blog_posts_status_published ON blog_posts(status, published_at DESC);
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

`lib/marketing/blog.ts`: `getPublishedPosts(limit?)` (status published, `published_at <= now`, desc) and `getPostBySlug(slug)` (returns null unless published) via admin client. (`published_at` is a timestamptz compared against the current instant — plain `new Date().toISOString()` is CORRECT here; the Sydney-day rule only applies to DATE-column comparisons like clinics/leads.) Tests mock the client; assert draft filtered, slug miss → null.

- [ ] TDD cycle; commit `feat(blog): blog_posts table and public query lib`.

### Task 5.2: Admin blog editor

**Files:**
- Create: `lib/blog/admin-actions.ts`, `app/(dashboard)/admin/marketing/blog/page.tsx`, `app/(dashboard)/admin/marketing/blog/[id]/page.tsx`
- Test: `lib/blog/__tests__/admin-actions.test.ts`

Follow the existing `/admin/marketing/testimonials` page as the structural template (read it first). List page: table of posts (title, status, published_at), "New post" button. Editor: title, slug (auto from title, editable), excerpt, markdown `Textarea` **with a live preview pane** (Edit / Preview tabs using `components/ui/tabs` — spec requires "markdown textarea with preview"), cover image URL, SEO fields, Save draft / Publish / Unpublish. Server actions with zod; slug uniqueness surfaced as a friendly error; publish sets `published_at` if null. Markdown rendering (both the preview and the public post page): **`react-markdown` — already in package.json and already used in `components/announcements/announcement-detail.tsx`** — follow that usage; add nothing new.

Tests: create/update happy paths, invalid payload rejected, publish stamps `published_at`, slug collision error.

- [ ] TDD cycle; build; manual dev check of the editor; commit `feat(blog): admin editor`.

### Task 5.3: Public blog pages + WP import

**Files:**
- Create: `app/(marketing)/blog/page.tsx`, `app/(marketing)/blog/[slug]/page.tsx`, `components/marketing/blog-teasers.tsx`, `scripts/import-wp-posts.mjs`
- Modify: `app/(marketing)/page.tsx` (section 9: 3 latest teasers)

Blog index: card grid of published posts. Post page: `generateStaticParams` from published slugs + `revalidate = 300`; draft/missing slug → `notFound()`. Import script: fetch the WP REST API (`https://buildalphakids.com.au/wp-json/wp/v2/posts?per_page=100`) — if the WP REST API is disabled, fall back to manual copy from the live pages (there are only ~3 posts) — convert HTML → markdown (`turndown` as a devDependency, or hand-convert given the tiny count), preserve original slugs, insert as `published` with original dates via service role. Run once against the branch DB; keep the script for the production cutover.

- [ ] Build, run import, verify posts render at their original slugs; homepage teasers show. Commit `feat(blog): public pages + WordPress import`.

## Chunk 6: SEO, redirects, performance, QA gate

### Task 6.0: Domain configuration (added 2026-07-15 — owner decision)

**Decision (Jayden, 2026-07-15):** the dashboard **stays at `buildalphakids.app`** (it is already live there — verified via the Vercel project `bak-app`, which currently has `buildalphakids.app` + `bak-app.vercel.app` + two preview domains attached). The public site launches at **`buildalphakids.com.au`**. Both domains point at the **same Vercel project / same Next app** — this is not a second deployment.

Rejected (for now): moving the dashboard to `app.buildalphakids.com.au`. It was considered and is still the nicer end-state (one brand, shared session cookies), but it means migrating a live product — everyone re-logs in, `buildalphakids.app` needs a permanent redirect, Supabase allowlist + env changes — and stacking that on top of the DNS cutover doubles the blast radius during launch week. The platform is beta (~4 centres) so the migration cost barely grows; revisit after the site is stable. **Build so that move is a config change, not a rewrite.**

**The consequence that needs code:** with both domains on one app, a parent can arrive on either host. `sendParentMagicLink` currently builds its redirect from `getBaseUrl()`, which is pinned to the app domain — so a parent who starts on `buildalphakids.com.au` would receive a magic link to `buildalphakids.app`, land there, get their session cookie set on `.app`, and appear logged-OUT when they return to `.com.au`. Cookies cannot span the two TLDs.

**Files:**
- Modify: `lib/utils/base-url.ts` (add a marketing-canonical helper + a request-host-aware auth callback builder), `lib/parent/actions.ts` + `lib/parent/safe-next.ts` (host-aware redirect), `app/(marketing)/layout.tsx` (canonical metadata)
- Create: `lib/utils/__tests__/base-url.test.ts` if not present

**Changes:**
1. **`NEXT_PUBLIC_MARKETING_URL`** (new env, default `https://buildalphakids.com.au`) — the canonical public origin. Add `getMarketingUrl()`. Tasks 6.1 (metadata/OG/JSON-LD) and 6.2 (sitemap/robots) MUST build absolute URLs from this, never from `getBaseUrl()` (which is the app domain).
2. **Parent magic links follow the host the parent is actually on.** Derive the callback origin from the request host, validated against a strict allowlist (`buildalphakids.com.au`, `www.buildalphakids.com.au`, `buildalphakids.app`, the `VERCEL_URL` preview, `localhost:3000`); fall back to `getBaseUrl()` if the host is unrecognised. Staff flows (login, password reset, crons, invoice PDFs) keep using `getBaseUrl()` — do NOT make those host-aware.
3. **Both hosts must be in the Supabase auth redirect allowlist** — owner config step, document it.
4. **Duplicate-content protection**: marketing pages are reachable on both hosts. Emit `<link rel="canonical">` pointing at the `getMarketingUrl()` origin on every marketing page (Task 6.1 does this — this task just supplies the helper), and Task 6.2's `robots.ts` should only advertise the sitemap on the canonical host.
5. **Book-now / parent links stay RELATIVE** (`/parent/book/[id]`) — that is what keeps a parent on whichever host they arrived on, so their session and the nav's "My account" swap work. Do not hardcode an absolute app-domain URL into marketing CTAs.
6. Fix the one hardcoded domain: `app/api/cron/onboarding-emails/route.ts:270` hardcodes `https://app.buildalphakids.com.au` (a domain that isn't even attached to the project) — route it through `getBaseUrl()`.

**Owner config (not code — document in the QA checklist):** add `buildalphakids.com.au` + `www` to the Vercel project; set `NEXT_PUBLIC_MARKETING_URL`; add both origins to Supabase's redirect allowlist; keep `NEXT_PUBLIC_SITE_URL` = `https://buildalphakids.app`.

**Future move to `app.buildalphakids.com.au`** then becomes: attach the domain, redirect `buildalphakids.app` → it, change `NEXT_PUBLIC_SITE_URL`, add one Supabase allowlist entry. No code change. The nav's "My account" swap starts working on `.com.au` automatically once both are same-site.

Verification: unit tests for the host allowlist (valid hosts pass, unknown/spoofed `Host` falls back, no open redirect); `npx vitest run`; `npm run build`.



### Task 6.1: Metadata + JSON-LD

**Files:**
- Create: `lib/marketing/jsonld.ts`
- Modify: every `app/(marketing)/*/page.tsx` (add `export const metadata` / `generateMetadata`), `app/(marketing)/layout.tsx` (metadata template `"%s | Build Alpha Kids"`, default OG image)

`jsonld.ts`: `localBusinessJsonLd()` (name, url, phone, area served), `eventJsonLd(clinic)` (name, startDate combining date+start_time with the **correct Sydney offset for that date** — AEDT `+11:00` during daylight saving, AEST `+10:00` otherwise; use the existing `lib/utils/sydney-time.ts` helpers to derive it rather than hardcoding, since October/December–January clinic seasons are all AEDT), location, offers with AUD price + availability from spots), `articleJsonLd(post)`. The jsonld test must cover one AEST date and one AEDT date. Render via `<script type="application/ld+json">` — LocalBusiness in marketing layout, Event per clinic card page (`/holiday-clinics`), Article on blog posts. Unit-test `eventJsonLd` date/price shaping in `lib/marketing/__tests__/jsonld.test.ts`.

- [ ] TDD for jsonld, metadata sweep, build. Commit `feat(marketing): metadata + structured data`.

### Task 6.2: Sitemap, robots, WP redirects

**Files:**
- Create: `app/sitemap.ts`, `app/robots.ts`
- Modify: `next.config.ts` (`redirects()`)

Sitemap: static marketing routes + published blog slugs (via `getPublishedPosts`); exclude portals. Robots: allow all, disallow `/admin`, `/ops`, `/coach`, `/parent`, `/client`; point at sitemap. Redirects: **before writing, fetch the live WP sitemap** (`https://buildalphakids.com.au/sitemap.xml` or `/wp-sitemap.xml`) and map every indexed URL → new path (`/about-us` → `/about`, service pages → `/programs/<slug>`, blog posts → `/blog/<slug>`, everything unmatched → `/`), `permanent: true`.

- [ ] Build, verify `curl localhost:3000/sitemap.xml` + a redirect. Commit `feat(marketing): sitemap, robots, WordPress 301 map`.

### Task 6.3: Performance + full verification pass

- [ ] `npm run build` — zero errors, marketing routes show as `○ (Static)` or ISR in the route summary; portals unchanged.
- [ ] `npx vitest run` — entire suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Lighthouse against `npm run start` on `/`, `/holiday-clinics`, one program page, one blog post — Performance ≥ 95, SEO ≥ 95 each. Fix images (`next/image`, explicit sizes) if short.
- [ ] Grep sweep per user standards: no `console.log` in new production code (`grep -rn "console\." app/\(marketing\) components/marketing lib/marketing lib/blog | grep -v test`).
- [ ] Commit any fixes: `chore(marketing): performance + hygiene pass`.

### Task 6.4: Manual QA checklist (cutover gate — human involved)

**BRANCH DEPENDENCY (found 2026-07-15): this branch now needs `fix/public-stats-cache-zeros` merged.** The impact band's "Sessions delivered" reads `total_sessions_all_time`. On `main`, the refresh-stats cron (`0 5 * * *`, daily 05:00 — `vercel.json`) still filters sessions on `status = 'completed'`, which matches zero rows because ops never sets that status, so it writes 0. The live cache currently holds 11 ONLY because the corrected refresh was run manually on 2026-07-15 — **the next unmerged cron run overwrites it back to 0** and the stat silently degrades to an em-dash. Merge `fix/public-stats-cache-zeros` (commit `68a235a`) before or with this branch. Same applies to `sessions_this_term`.

**Launch risk to verify FIRST (found 2026-07-15):** the `SUPABASE_SERVICE_ROLE_KEY` in the local `.env.production.local` is rejected by Supabase ("Invalid API key") — it appears rotated/stale. Every public live section (clinics, stats, testimonials) reads via `createSupabaseAdmin()` with that key and **degrades silently to an empty state** if it's invalid — the page still renders, so a casual look won't catch it. Before/at cutover, confirm the key in the **Vercel production env** is current by loading the preview URL and checking that clinic cards and stat numbers actually appear (not em-dashes/empty states). The local file being stale proves nothing about Vercel — but it's the same class of failure and must be positively verified, not assumed.

Run on the Vercel preview URL with Jayden:

- [ ] Home → clinic card "Book now" → parent-login (with `next`) → magic link email → lands on `/parent/book/[id]` → Square sandbox payment completes
- [ ] Sold-out clinic shows waitlist CTA
- [ ] Enquiry submit → lead visible in `/admin` CRM kanban → staff notification + auto-ack email both received
- [ ] Newsletter signup → row in `newsletter_subscribers`
- [ ] Blog post renders at original WP slug; old WP URLs 301
- [ ] Mobile pass (nav sheet, cards, forms) on a real phone
- [ ] Logged-in parent visits `/` → sees "My account", not redirected

**DNS cutover (Jayden executes):** point buildalphakids.com.au at Vercel per spec §Launch cutover; keep WP hosting as archive; verify Search Console + submit sitemap after.

**Post-cutover cleanup task (create a follow-up):** remove WP origins from the enquiry CORS allowlist; decommission WordPress.

---

## Execution notes

- Tasks within a chunk are sequential; Chunks 3, 4, 5 are independent of each other after Chunk 2 lands (parallelisable across subagents if desired; Chunk 6 last).
- Photo assets: layout must render acceptably with the placeholder paths; swapping in Jayden's real photos is a content task, not a blocker.
- If local Supabase isn't running for manual checks, `npx supabase start` (see `supabase/` config) or verify against the branch DB per repo practice.
