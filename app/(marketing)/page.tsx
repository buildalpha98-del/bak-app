import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/marketing/hero";
import { SportsStrip } from "@/components/marketing/sports-strip";
import { WhatWeDo } from "@/components/marketing/what-we-do";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { ImpactBand } from "@/components/marketing/impact-band";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { B2bBand } from "@/components/marketing/b2b-band";
import { ClinicCard, ClinicsEmptyState } from "@/components/marketing/clinic-card";
import { TestimonialCard } from "@/components/marketing/testimonial-card";
import { StickerButton } from "@/components/marketing/sticker-button";
import { getOpenHolidayClinics } from "@/lib/marketing/clinics";
import type { PublicClinic } from "@/lib/marketing/clinics-shared";
import { getImpactStats, IMPACT_FALLBACK } from "@/lib/marketing/stats";
import {
  getApprovedTestimonials,
  type PublicTestimonial,
} from "@/lib/marketing/testimonials";
import type { ImpactStat } from "@/components/marketing/impact-band";
import { HOMEPAGE, PROGRAMS, SITE } from "@/lib/marketing/content";

/** ISR — clinic dates/spot counts refresh within 5 minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: HOMEPAGE.heroSub,
};

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
 *  6. Impact band  — live values from public_stats_cache
 *  7. Holiday clinic cards — live upcoming clinics
 *  8. How it works
 *  9. Testimonials — live approved testimonials
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

      <ImpactBandSection />

      <HolidayClinicsSection />

      <HowItWorks />

      <TestimonialsSection />

      <B2bBand />

      {/* INSERTION POINT — Chunk 5: latest blog teasers (<BlogTeasers />) */}

      {/* INSERTION POINT — Chunk 4: newsletter signup (<NewsletterSignup />) */}
    </>
  );
}

/**
 * Live impact band — four counts from public_stats_cache. A failed
 * fetch degrades to the em-dash placeholders (IMPACT_FALLBACK) and
 * per-key gaps degrade inside getImpactStats, so the band always
 * renders. Refreshes with the page's ISR window (revalidate 300).
 */
async function ImpactBandSection() {
  let stats: ImpactStat[];
  try {
    stats = await getImpactStats();
  } catch {
    stats = IMPACT_FALLBACK;
  }

  return <ImpactBand stats={stats} />;
}

/**
 * Live testimonials — up to four approved quotes, newest first. An
 * empty table or a failed fetch renders nothing at all (no heading,
 * no gap): the homepage flows straight from how-it-works to the B2B
 * band, exactly as it did before this section existed.
 */
async function TestimonialsSection() {
  let testimonials: PublicTestimonial[] = [];
  try {
    testimonials = await getApprovedTestimonials(4);
  } catch {
    testimonials = [];
  }

  if (testimonials.length === 0) return null;

  return (
    <Section aria-label="Testimonials" className="bg-white">
      <SectionHeading
        eyebrow="What parents and schools say"
        title="Loved on both sides of the sideline"
        intro="Real feedback from the parents, centres and schools we coach for every week."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {testimonials.map((testimonial, i) => (
          <TestimonialCard
            key={`${testimonial.display_name}-${i}`}
            testimonial={testimonial}
            className={i === 1 ? "sm:rotate-1" : undefined}
          />
        ))}
      </div>
    </Section>
  );
}

/**
 * Live "next four clinics" section. The fetch failing (or returning
 * nothing) renders the friendly empty state — a DB hiccup must never
 * break the homepage, and the whole page stays ISR (revalidate 300)
 * so the hit is at most one query per 5 minutes anyway.
 */
async function HolidayClinicsSection() {
  let clinics: PublicClinic[] = [];
  try {
    clinics = await getOpenHolidayClinics(4);
  } catch {
    clinics = [];
  }

  return (
    <Section aria-label="School holiday clinics" className="bg-white">
      <SectionHeading
        eyebrow="Book direct"
        title="School holiday clinics"
        intro="The next dates on the calendar — book and pay online in about 60 seconds. Spots are capped and the best days sell out fast."
      />

      {clinics.length === 0 ? (
        <div className="mt-12">
          <ClinicsEmptyState />
        </div>
      ) : (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {clinics.map((clinic) => (
            <ClinicCard key={clinic.id} clinic={clinic} />
          ))}
        </div>
      )}

      <div className="mt-12">
        <StickerButton href="/holiday-clinics">
          See all clinic dates
          <ArrowRight className="size-5" aria-hidden="true" />
        </StickerButton>
      </div>
    </Section>
  );
}
