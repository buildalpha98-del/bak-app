import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { B2bBand } from "@/components/marketing/b2b-band";
import { PROGRAMS, SITE } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description:
    "Multi-sport coaching across South-West Sydney childcare centres, schools and holiday clinics. Book online in 60 seconds — then watch them grow all term.",
};

/**
 * Homepage — sections render in the approved order. Live-data
 * sections land in later chunks; the comments below mark exactly
 * where each one slots in.
 *
 *  1. Nav          — (marketing)/layout.tsx
 *  2. Hero
 *  3. Stats band   — Chunk 2 (live counts, count-up motion)
 *  4. Programs grid
 *  5. Holiday clinic cards — Chunk 2 (live upcoming clinics)
 *  6. How it works
 *  7. Testimonials — Chunk 2
 *  8. B2B band
 *  9. Blog teasers — Chunk 5
 * 10. Newsletter signup — Chunk 4
 * 11. Footer       — (marketing)/layout.tsx
 */
export default function HomePage() {
  return (
    <>
      <Hero />

      {/* INSERTION POINT — Chunk 2: live stats band (<StatsBand />) */}

      <Section aria-label="Our programs">
        <SectionHeading
          eyebrow="Programs"
          title="A program for every age and stage"
          intro="From first steps on the grass to game-day tactics — five programs that grow with your kids."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((program, index) => (
            <ProgramCard key={program.slug} program={program} index={index} />
          ))}
        </div>
      </Section>

      {/* INSERTION POINT — Chunk 2: upcoming holiday clinic cards (<ClinicCards />) */}

      <HowItWorks />

      {/* INSERTION POINT — Chunk 2: parent testimonials (<Testimonials />) */}

      <B2bBand />

      {/* INSERTION POINT — Chunk 5: latest blog teasers (<BlogTeasers />) */}

      {/* INSERTION POINT — Chunk 4: newsletter signup (<NewsletterSignup />) */}
    </>
  );
}
