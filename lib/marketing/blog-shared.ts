// ============================================================
// Blog helpers — pure + client-safe
// ============================================================
//
// Pure display logic shared by the blog card, the post page and the
// homepage teasers. MUST stay free of server-only imports (Supabase
// admin client, service-role env) — import the queries themselves from
// lib/marketing/blog.ts, and only from server code.
//
// Task 5.1 noted that blog.ts had no pure logic worth splitting out
// "the way clinics did", and to split it out when some appeared. This
// is that moment: the date formatter below has two callers and one
// sharp edge worth testing.

/**
 * A post's publication date, e.g. "6 August 2024".
 *
 * `published_at` is a timestamptz — an INSTANT, not a calendar date —
 * so this is deliberately not the string-parts maths that
 * clinics-shared.ts does on its DATE columns. It has to be projected
 * into a timezone, and the only correct one is the brand's: Sydney.
 *
 * Passing timeZone explicitly is load-bearing, not decoration. Vercel
 * runs in bom1 (UTC+5:30), so the server default would render a post
 * published 2024-08-06T15:00Z as 6 August while a Sydney reader is
 * already on 7 August. The same instant must read the same way for
 * everyone, and "the same way" means Sydney.
 */
export function formatPostDate(publishedAt: string): string {
  return new Date(publishedAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}
