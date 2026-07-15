import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { SportsStrip } from "@/components/marketing/sports-strip";
import { WhatWeDo } from "@/components/marketing/what-we-do";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { ImpactBand } from "@/components/marketing/impact-band";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { B2bBand } from "@/components/marketing/b2b-band";
import { HOMEPAGE, PROGRAMS, SITE } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: HOMEPAGE.heroSub,
};

/**
 * Placeholder impact stats — Task 2.3 (Chunk 2) replaces these
 * values with live counts from public_stats_cache via the same
 * <ImpactBand stats={...} /> prop. Labels are real; values are em
 * dashes until the live feed lands.
 */
const IMPACT_PLACEHOLDER = [
  { label: "Kids coached", value: "—" },
  { label: "Centres & schools", value: "—" },
  { label: "Sports on rotation", value: "—" },
];

/**
 * Homepage — sections render in the approved order. Live-data
 * sections land in later chunks; the comments below mark exactly
 * where each one slots in.
 *
 *  1. Nav          — (marketing)/layout.tsx
 *  2. Hero (+ ball-row breakout)
 *  3. Sports strip
 *  4. What we do
 *  5. Programs grid
 *  6. Impact band  — Chunk 2 feeds live values (placeholder now)
 *  7. Holiday clinic cards — Chunk 2 (live upcoming clinics)
 *  8. How it works
 *  9. Testimonials — Chunk 2
 * 10. B2B band
 * 11. Blog teasers — Chunk 5
 * 12. Newsletter signup — Chunk 4
 * 13. Footer       — (marketing)/layout.tsx
 */
export default function HomePage() {
  return (
    <>
      <Hero />

      <SportsStrip />

      <WhatWeDo />

      <Section aria-label="Our programs" className="bg-white">
        <SectionHeading
          eyebrow="Programs"
          title="A program for every age and stage"
          intro="From first steps on the grass to game-day tactics — five programs that grow with your kids."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((program, index) => (
            <ProgramCard key={program.slug} program={program} index={index} />
          ))}
        </div>
      </Section>

      {/* INSERTION POINT — Chunk 2: live stats band — feed <ImpactBand /> live values (swap stats prop, not markup) */}
      <ImpactBand stats={IMPACT_PLACEHOLDER} />

      {/* INSERTION POINT — Chunk 2: upcoming holiday clinic cards (<ClinicCards />) */}

      <HowItWorks />

      {/* INSERTION POINT — Chunk 2: parent testimonials (<Testimonials />) */}

      <B2bBand />

      {/* INSERTION POINT — Chunk 5: latest blog teasers (<BlogTeasers />) */}

      {/* INSERTION POINT — Chunk 4: newsletter signup (<NewsletterSignup />) */}
    </>
  );
}
