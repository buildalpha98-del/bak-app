import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { ProgramCard } from "@/components/marketing/program-card";
import { B2bBand } from "@/components/marketing/b2b-band";
import { BRAND, PROGRAMS, PROGRAMS_INDEX } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Programs",
  description: PROGRAMS_INDEX.description,
  alternates: { canonical: "/programs" },
};

/**
 * /programs — static index. The shared hero-lite sticker intro, the
 * five program cards, a ball-row motif divider, then the shared B2B
 * band pointing centres and schools at /enquire.
 */
export default function ProgramsPage() {
  return (
    <>
      <HeroLite
        label={PROGRAMS_INDEX.title}
        eyebrow={PROGRAMS_INDEX.eyebrow}
        title={PROGRAMS_INDEX.title}
        intro={PROGRAMS_INDEX.intro}
      />

      <Section aria-label="All programs" className="bg-white">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/*
            headingLevel={2}: this grid sits directly under the page h1
            with no section heading between, so the card titles are the
            page's top-level sections. The default (3) is correct on the
            homepage, where a section h2 sits above the same grid.
          */}
          {PROGRAMS.map((program) => (
            <ProgramCard
              key={program.slug}
              program={program}
              headingLevel={2}
            />
          ))}
        </div>
      </Section>

      <ProgramsDivider />

      <B2bBand />
    </>
  );
}

/**
 * Ball-row motif divider between the cards and the B2B band — the
 * same illustrated strip the heroes break out with, but laid out in
 * flow rather than pinned half-out of a band edge, so it composes the
 * artwork directly instead of reusing BallRowBreakout. Decorative.
 */
function ProgramsDivider() {
  return (
    <div aria-hidden="true" className="flex justify-center gap-8 bg-white pb-16">
      <Image
        src={BRAND.ballsRow}
        alt=""
        width={298}
        height={96}
        unoptimized
        className="h-12 w-auto sm:h-14"
      />
      <Image
        src={BRAND.ballsRowAlt}
        alt=""
        width={298}
        height={96}
        unoptimized
        className="hidden h-14 w-auto md:block"
      />
    </div>
  );
}
