import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { B2bBand } from "@/components/marketing/b2b-band";
import { BRAND, PROGRAMS, PROGRAMS_INDEX, SITE } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: `Programs — ${SITE.name}`,
  description: PROGRAMS_INDEX.description,
};

/**
 * /programs — static index. Sticker intro on court orange (the
 * hero-lite pattern from /holiday-clinics: arcs + ball-row breakout,
 * no photography), the five program cards, a ball-row motif divider,
 * then the shared B2B band pointing centres and schools at /enquire.
 *
 * Contrast (AA): H1 white on #E8712A is fine at heading size only;
 * the intro sits in near-black #1A1A1A (5.66:1 on orange).
 */
export default function ProgramsPage() {
  return (
    <>
      <section aria-label="Our programs" className="relative bg-[#E8712A]">
        {/* Court-line arc — decorative, clipped inside the band. */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-56 size-[480px] rounded-full border-[3px] border-white/15" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
          <p className="inline-block -rotate-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[3px_3px_0_#111]">
            {PROGRAMS_INDEX.eyebrow}
          </p>
          <h1 className="mt-6 font-heading text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {PROGRAMS_INDEX.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-medium leading-relaxed text-[#1A1A1A]">
            {PROGRAMS_INDEX.intro}
          </p>
        </div>

        {/* Ball row straddling the band's bottom edge (hero pattern). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-1/2 justify-center gap-10 px-4"
        >
          <Image
            src={BRAND.ballsRow}
            alt=""
            width={298}
            height={96}
            unoptimized
            className="h-14 w-auto sm:h-16"
          />
          <Image
            src={BRAND.ballsRowAlt}
            alt=""
            width={298}
            height={96}
            unoptimized
            className="hidden h-16 w-auto md:block"
          />
        </div>
      </section>

      <Section aria-label="All programs" className="bg-white">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((program) => (
            <ProgramCard key={program.slug} program={program} />
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
 * same illustrated strip the hero breaks out with, here centred as a
 * plain section rule. Decorative only.
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
