import type { Metadata } from "next";
import { HeroLite } from "@/components/marketing/hero-lite";
import { LegalBody } from "@/components/marketing/legal-body";
import { TERMS_PAGE } from "@/lib/marketing/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: TERMS_PAGE.description,
  alternates: { canonical: "/terms" },
};

/**
 * /terms — the Terms of Use.
 *
 * Fully static, same as /privacy: constants only, and a constant
 * "Last updated" date rather than a build-time one.
 *
 * All copy — and the sourcing rules for what may be claimed on this
 * page — lives in lib/marketing/legal.ts. Read that file's header
 * before changing a word here. The cancellation and refund clause in
 * particular is sourced from the code that enforces it
 * (lib/bookings/booking-actions.ts) — if that rule changes, this page
 * is wrong until it changes too.
 *
 * The old WordPress URL /terms-of-use 301s here (lib/marketing/wp-redirects.ts).
 */
export default function TermsPage() {
  return (
    <>
      <HeroLite
        label={TERMS_PAGE.title}
        eyebrow={TERMS_PAGE.eyebrow}
        title={TERMS_PAGE.title}
        intro={TERMS_PAGE.intro}
      />

      <LegalBody page={TERMS_PAGE} />
    </>
  );
}
