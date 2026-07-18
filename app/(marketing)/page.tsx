import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { SportsStrip } from "@/components/marketing/sports-strip";
import { WhatWeDo } from "@/components/marketing/what-we-do";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { ImpactBand } from "@/components/marketing/impact-band";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { B2bBand } from "@/components/marketing/b2b-band";
import { HolidayClinicsSection } from "@/components/marketing/holiday-clinics-section";
import { BlogTeasers } from "@/components/marketing/blog-teasers";
import { NewsletterForm } from "@/components/marketing/newsletter-form";
import { PartnerStrip } from "@/components/marketing/partner-strip";
import { TestimonialCard } from "@/components/marketing/testimonial-card";
import {
  getApprovedTestimonials,
  type PublicTestimonial,
} from "@/lib/marketing/testimonials";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import {
  HOMEPAGE,
  HOMEPAGE_CLINICS,
  IMPACT_STATS,
  NEWSLETTER,
  PROGRAMS,
  PROGRAMS_INDEX,
  SITE,
} from "@/lib/marketing/content";

/** ISR — clinic dates/spot counts refresh within 5 minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  // `absolute` opts out of the layout's "%s | Build Alpha Kids"
  // template — the brand already leads this title.
  title: { absolute: `${SITE.name} — ${SITE.tagline}` },
  description: HOMEPAGE.heroSub,
  alternates: { canonical: "/" },
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
 *  6. Impact band  — owner-supplied career totals (IMPACT_STATS)
 *  7. Partner strip — named partner schools/centres marquee
 *  8. Holiday clinic cards — live upcoming clinics
 *  9. How it works
 * 10. Testimonials — live approved testimonials
 * 11. B2B band
 * 12. Blog teasers — 3 latest published posts
 * 13. Newsletter signup
 * 14. Footer       — (marketing)/layout.tsx
 */
export default function HomePage() {
  return (
    <>
      <Hero />

      <SportsStrip />

      <WhatWeDo />

      <Section aria-label="Our programs" className="bg-white">
        <SectionHeading
          eyebrow={PROGRAMS_INDEX.eyebrow}
          title={PROGRAMS_INDEX.title}
          intro="From first steps on the grass to game-day tactics — five programs that grow with your kids."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((program) => (
            <ProgramCard key={program.slug} program={program} />
          ))}
        </div>
      </Section>

      <ImpactBand stats={[...IMPACT_STATS]} />

      <PartnerStrip />

      <HolidayClinicsSection
        limit={4}
        columns={4}
        eyebrow={HOMEPAGE_CLINICS.eyebrow}
        title={HOMEPAGE_CLINICS.title}
        intro={HOMEPAGE_CLINICS.intro}
      />

      <HowItWorks />

      <TestimonialsSection />

      <B2bBand />

      <BlogTeasers />

      <NewsletterSection />
    </>
  );
}

/**
 * Newsletter capture — the page's last word, and the only orange band
 * on it, which is the point: it has to read as a different kind of ask
 * to the B2B band above it.
 *
 * Contrast (AA): black-on-yellow eyebrow 13.1:1; the white heading is
 * ≥30px, where white on #E8712A is fine; the intro is #1A1A1A on
 * orange (~5.8:1) rather than white/70, which would fail at body size.
 *
 * The form is the only client component here — the section is static
 * and the page stays ISR (revalidate 300).
 */
function NewsletterSection() {
  return (
    <Section aria-labelledby="newsletter-heading" className="bg-[#E8712A]">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <p className="inline-block -rotate-1 rounded-full border-2 border-[#111] bg-[#FFD23F] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[2px_2px_0_#111]">
            {NEWSLETTER.eyebrow}
          </p>
          <h2
            id="newsletter-heading"
            className="mt-5 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            {NEWSLETTER.title}
          </h2>
          <p className="mt-4 text-base font-medium leading-relaxed text-[#1A1A1A] sm:text-lg">
            {NEWSLETTER.intro}
          </p>
        </div>

        <NewsletterForm sourcePage="/" />
      </div>
    </Section>
  );
}

/**
 * Live testimonials — up to four approved quotes, newest first. An
 * empty table or a failed fetch renders nothing at all (no heading,
 * no gap): the homepage flows straight from how-it-works to the B2B
 * band, exactly as it did before this section existed.
 */
async function TestimonialsSection() {
  const testimonials = await safeFetch<PublicTestimonial[]>(
    () => getApprovedTestimonials(4),
    []
  );

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

