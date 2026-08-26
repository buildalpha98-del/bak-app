import type { Metadata } from "next";
import Image from "next/image";
import { HeroLite } from "@/components/marketing/hero-lite";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ProgramCard } from "@/components/marketing/program-card";
import { PartnerStrip } from "@/components/marketing/partner-strip";
import { FaqList } from "@/components/marketing/faq-list";
import { CtaBand } from "@/components/marketing/cta-band";
import { StickerButton } from "@/components/marketing/sticker-button";
import { JsonLd } from "@/components/marketing/json-ld";
import { faqPageJsonLd } from "@/lib/marketing/jsonld";
import { SCHOOLS_DEEP, CARNIVAL_OFFER } from "@/lib/marketing/deep-content";
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

      {/* Real footage still (showreel, 2026-08): the programs in action. */}
      <Section aria-label="Build Alpha Kids sessions in action" className="bg-white pt-0">
        <div className="mx-auto max-w-4xl rotate-[-1deg] rounded-[2rem] border-2 border-[#111] bg-white p-2.5 shadow-[8px_8px_0_#111] sm:p-3">
          <Image
            src="/images/marketing/schools-action.jpg"
            alt="A student sprints with the ball through a Build Alpha Kids multi-sport school program, coaches running the drill behind"
            width={1600}
            height={900}
            sizes="(min-width: 1024px) 896px, 100vw"
            className="h-auto w-full rounded-[1.4rem]"
          />
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

      {/* ── Deep-content pack §1: what delivery looks like ── */}
      <Section
        aria-label={SCHOOLS_DEEP.deliveryTitle}
        className="bg-[#FFF7F2]"
      >
        <SectionHeading
          eyebrow={SCHOOLS_DEEP.deliveryEyebrow}
          title={SCHOOLS_DEEP.deliveryTitle}
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {SCHOOLS_DEEP.delivery.map((model) => (
            <article
              key={model.title}
              className="rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
            >
              <span
                aria-hidden
                className="inline-block size-4 rounded-full border-2 border-[#111]"
                style={{ backgroundColor: model.ball.color }}
              />
              <h3 className="mt-3 font-heading text-lg font-extrabold tracking-tight text-[#111]">
                {model.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80 sm:text-base">
                {model.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* ── What a term looks like — the 10-week arc ── */}
      <Section aria-label={SCHOOLS_DEEP.termTitle} className="bg-white">
        <SectionHeading
          eyebrow={SCHOOLS_DEEP.termEyebrow}
          title={SCHOOLS_DEEP.termTitle}
        />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {SCHOOLS_DEEP.termWeeks.map((w, i) => (
            <li
              key={w.weeks}
              className="rounded-2xl border-2 border-[#111] bg-[#FFF7F2] p-5 shadow-[4px_4px_0_#111]"
            >
              <span
                className="inline-flex items-center rounded-full border-2 border-[#111] px-3 py-0.5 font-heading text-xs font-extrabold uppercase tracking-wide"
                style={{
                  backgroundColor: CARD_BALLS[i % CARD_BALLS.length].color,
                  color: CARD_BALLS[i % CARD_BALLS.length].fg,
                }}
              >
                {w.weeks}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80">
                {w.body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-8 max-w-3xl text-center font-heading text-base font-bold text-[#111] sm:text-lg">
          {SCHOOLS_DEEP.termArc}
        </p>
      </Section>

      {/* ── Stage-by-stage outcomes ── */}
      <Section aria-label={SCHOOLS_DEEP.stagesTitle} className="bg-[#FFF7F2]">
        <SectionHeading
          eyebrow={SCHOOLS_DEEP.stagesEyebrow}
          title={SCHOOLS_DEEP.stagesTitle}
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {SCHOOLS_DEEP.stages.map((s) => (
            <article
              key={s.stage}
              className="rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
            >
              <h3
                className="inline-block rounded-full border-2 border-[#111] px-4 py-1 font-heading text-sm font-extrabold"
                style={{ backgroundColor: s.ball.color, color: s.ball.fg }}
              >
                {s.stage}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-[#1A1A1A]/80 sm:text-base">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* ── Assessment & reporting + compliance pack ── */}
      <Section aria-label={SCHOOLS_DEEP.assessmentTitle} className="bg-white">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow={SCHOOLS_DEEP.assessmentEyebrow}
              title={SCHOOLS_DEEP.assessmentTitle}
            />
            <ul className="mt-8 space-y-3">
              {SCHOOLS_DEEP.assessmentPoints.map((point) => (
                <li key={point} className="flex gap-3 text-sm sm:text-base">
                  <span aria-hidden className="mt-1.5 inline-block size-2.5 shrink-0 rounded-full border-2 border-[#111] bg-[#FFD23F]" />
                  <span className="text-[#1A1A1A]/85">{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl border-2 border-[#111] bg-[#FFF7F2] p-5 text-sm leading-relaxed text-[#1A1A1A]/85 shadow-[4px_4px_0_#111]">
              {SCHOOLS_DEEP.assessmentCurriculum}
            </p>
          </div>
          <div>
            <SectionHeading
              eyebrow={SCHOOLS_DEEP.complianceEyebrow}
              title={SCHOOLS_DEEP.complianceTitle}
            />
            <ul className="mt-8 space-y-3">
              {SCHOOLS_DEEP.compliancePoints.map((point) => (
                <li key={point} className="flex gap-3 text-sm sm:text-base">
                  <span aria-hidden className="mt-1.5 inline-block size-2.5 shrink-0 rounded-full border-2 border-[#111] bg-[#7BC043]" />
                  <span className="text-[#1A1A1A]/85">{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-[#1A1A1A]/70 sm:text-base">
              {SCHOOLS_DEEP.complianceNote}
            </p>
          </div>
        </div>
      </Section>

      {/* ── 2027 carnival offer banner ── */}
      <Section aria-label={CARNIVAL_OFFER.title} className="bg-[#1A1A1A]">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-heading text-sm font-extrabold uppercase tracking-widest text-[#FFD23F]">
            {CARNIVAL_OFFER.eyebrow}
          </p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {CARNIVAL_OFFER.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/85 sm:text-lg">
            {CARNIVAL_OFFER.body}
          </p>
          <div className="mt-8 flex justify-center">
            <StickerButton href={CARNIVAL_OFFER.href} shadow="orange">
              {CARNIVAL_OFFER.cta}
            </StickerButton>
          </div>
        </div>
      </Section>

      <PartnerStrip />

      <FaqList
        eyebrow={SCHOOLS_PAGE.faqsEyebrow}
        title={SCHOOLS_PAGE.faqsTitle}
        faqs={SCHOOLS_PAGE.faqs}
        className="bg-[#FFF7F2]"
      />
      <JsonLd data={faqPageJsonLd(SCHOOLS_PAGE.faqs)} />

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
