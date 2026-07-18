import type { Metadata } from "next";
import { HeroLite } from "@/components/marketing/hero-lite";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { PartnerStrip } from "@/components/marketing/partner-strip";
import { FaqList } from "@/components/marketing/faq-list";
import { CtaBand } from "@/components/marketing/cta-band";
import { StickerButton } from "@/components/marketing/sticker-button";
import {
  BALL_COLORS,
  PROGRAM_PAGE,
  PROGRAMS,
  SCHOOLS_PAGE,
  SITE,
  phoneHref,
  type BallColor,
} from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "School Programs",
  description: SCHOOLS_PAGE.description,
  alternates: { canonical: "/schools" },
};

/**
 * /schools — the flagship B2B landing page (owner-directed 2026-07-18:
 * schools and childcare are the primary audiences). Fully static: every
 * word comes from SCHOOLS_PAGE / PROGRAMS in lib/marketing/content.ts,
 * which also records the sourcing for each claim.
 *
 * The three offer cards are the school-relevant PROGRAMS entries —
 * shared ProgramCard, so the cards here can never drift from the
 * program pages they link to.
 */

/** Card accents cycle through the palette in a fixed, deliberate order. */
const CARD_BALLS: BallColor[] = [
  BALL_COLORS.blue,
  BALL_COLORS.green,
  BALL_COLORS.yellow,
  BALL_COLORS.red,
];

const SCHOOL_PROGRAM_SLUGS = ["primary-school", "high-school", "after-school"];

export default function SchoolsPage() {
  const schoolPrograms = PROGRAMS.filter((p) =>
    SCHOOL_PROGRAM_SLUGS.includes(p.slug)
  );

  return (
    <>
      <HeroLite
        label={SCHOOLS_PAGE.title}
        eyebrow={SCHOOLS_PAGE.eyebrow}
        title={SCHOOLS_PAGE.title}
        intro={SCHOOLS_PAGE.intro}
      >
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <StickerButton href={SITE.enquiryUrl}>
            {PROGRAM_PAGE.quoteCta}
          </StickerButton>
          <StickerButton href={phoneHref()} fill="white">
            Call {SITE.phone}
          </StickerButton>
        </div>
      </HeroLite>

      <Section aria-label={SCHOOLS_PAGE.whyTitle} className="bg-white">
        <SectionHeading
          eyebrow={SCHOOLS_PAGE.whyEyebrow}
          title={SCHOOLS_PAGE.whyTitle}
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {SCHOOLS_PAGE.why.map((item, i) => (
            <article
              key={item.title}
              className="rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
            >
              <span
                aria-hidden="true"
                className="inline-block size-5 rounded-full border-2 border-[#111]"
                style={{
                  backgroundColor: CARD_BALLS[i % CARD_BALLS.length].color,
                }}
              />
              <h3 className="mt-4 font-heading text-lg font-extrabold tracking-tight text-[#111]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80 sm:text-base">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        aria-label={SCHOOLS_PAGE.offeringsTitle}
        className="bg-[#FFF7F2]"
      >
        <SectionHeading
          eyebrow={SCHOOLS_PAGE.offeringsEyebrow}
          title={SCHOOLS_PAGE.offeringsTitle}
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {schoolPrograms.map((program) => (
            <ProgramCard key={program.slug} program={program} />
          ))}
        </div>
      </Section>

      <Section aria-label={SCHOOLS_PAGE.stepsTitle} className="bg-white">
        <SectionHeading
          eyebrow={SCHOOLS_PAGE.stepsEyebrow}
          title={SCHOOLS_PAGE.stepsTitle}
        />

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {SCHOOLS_PAGE.steps.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
            >
              <span
                className="inline-flex size-10 items-center justify-center rounded-full border-2 border-[#111] font-heading text-lg font-extrabold"
                style={{
                  backgroundColor: CARD_BALLS[i % CARD_BALLS.length].color,
                  color: CARD_BALLS[i % CARD_BALLS.length].fg,
                }}
              >
                {i + 1}
              </span>
              <h3 className="mt-4 font-heading text-lg font-extrabold tracking-tight text-[#111]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80 sm:text-base">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <PartnerStrip />

      <FaqList
        eyebrow={SCHOOLS_PAGE.faqsEyebrow}
        title={SCHOOLS_PAGE.faqsTitle}
        faqs={SCHOOLS_PAGE.faqs}
        className="bg-[#FFF7F2]"
      />

      <CtaBand
        eyebrow={PROGRAM_PAGE.quoteEyebrow}
        title="Want this running at your school?"
        body={PROGRAM_PAGE.quoteBody}
        href={SITE.enquiryUrl}
        cta={PROGRAM_PAGE.quoteCta}
      />
    </>
  );
}
