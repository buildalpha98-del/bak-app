import type { Metadata } from "next";
import { HeroLite } from "@/components/marketing/hero-lite";
import { LegalBody } from "@/components/marketing/legal-body";
import { PRIVACY_PAGE } from "@/lib/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: PRIVACY_PAGE.description,
  alternates: { canonical: "/privacy" },
};

/**
 * /privacy — the Privacy Policy.
 *
 * Fully static: the copy is constants and nothing here reads the
 * database or the clock (the "Last updated" date is a constant in
 * lib/marketing/legal.ts, not `new Date()`, so a redeploy cannot
 * silently claim a revision that never happened).
 *
 * All copy — and the sourcing rules for what may be claimed on this
 * page — lives in lib/marketing/legal.ts. Read that file's header
 * before changing a word here.
 *
 * The old WordPress URL /privacy-policy 301s here (lib/marketing/wp-redirects.ts).
 */
export default function PrivacyPage() {
  return (
    <>
      <HeroLite
        label={PRIVACY_PAGE.title}
        eyebrow={PRIVACY_PAGE.eyebrow}
        title={PRIVACY_PAGE.title}
        intro={PRIVACY_PAGE.intro}
      />

      <LegalBody page={PRIVACY_PAGE} />
    </>
  );
}
