import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { CtaBand } from "@/components/marketing/cta-band";
import { SportsStrip } from "@/components/marketing/sports-strip";
import { ImpactBand } from "@/components/marketing/impact-band";
import { getImpactStats, IMPACT_FALLBACK } from "@/lib/marketing/stats";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import {
  ABOUT_PAGE,
  BALL_COLORS,
  COACH_STANDARDS,
  PROGRAM_PAGE,
  SITE,
} from "@/lib/marketing/content";

/**
 * ISR — the impact band reads live values from public_stats_cache, so
 * this page carries the same 5-minute window as / and /holiday-clinics
 * rather than being fully static.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "About",
  description: ABOUT_PAGE.description,
  alternates: { canonical: "/about" },
};

/**
 * /about — the story, what we back, the coach standards, the live
 * impact band, then the quote CTA for centres and schools.
 *
 * No copy is inline here: everything comes from ABOUT_PAGE /
 * COACH_STANDARDS in lib/marketing/content.ts, which also carries the
 * sourcing rules for what may and may not be claimed on this page.
 *
 * Contrast (AA): HeroLite handles its own pairings; standards cards
 * are black-on-white with palette accents carrying their verified
 * `fg`; the impact band and CTA band are white on #1A1A1A.
 */
export default function AboutPage() {
  return (
    <>
      <HeroLite
        label={ABOUT_PAGE.title}
        eyebrow={ABOUT_PAGE.eyebrow}
        title={ABOUT_PAGE.title}
        intro={ABOUT_PAGE.intro}
      />

      {/* Story + what we back — the program page's overview layout. */}
      <Section aria-label={ABOUT_PAGE.storyTitle} className="bg-white">
        <SectionHeading
          eyebrow={ABOUT_PAGE.storyEyebrow}
          title={ABOUT_PAGE.storyTitle}
        />

        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-6">
          <div className="space-y-5">
            {ABOUT_PAGE.story.map((paragraph, i) => (
              <p
                key={i}
                className="text-base leading-relaxed text-[#1A1A1A]/80 sm:text-lg"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Beliefs — a sticker panel rather than another card grid, so
              the section reads as one statement, not five features. */}
          <div className="rounded-2xl border-2 border-[#111] bg-[#FFF7F2] p-7 shadow-[5px_5px_0_#111] md:rotate-1">
            <h3 className="font-heading text-xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-2xl">
              {ABOUT_PAGE.beliefsTitle}
            </h3>
            <ul className="mt-6 space-y-4">
              {ABOUT_PAGE.beliefs.map((belief) => (
                <li key={belief} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 rounded-full border-2 border-[#111]"
                    style={{ backgroundColor: BALL_COLORS.orange.color }}
                  />
                  <span className="font-heading text-base font-bold leading-snug text-[#111]">
                    {belief}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <CoachStandardsSection />

      <ImpactBandSection />

      {/* The sports strip sits between the two near-black bands on
          purpose: back to back they merge into one long dark stretch.
          Same job the homepage's testimonials do before its B2B band. */}
      <SportsStrip />

      {/* The same quote band the program pages close on — same words,
          so it reads from PROGRAM_PAGE rather than restating them. */}
      <CtaBand
        label={PROGRAM_PAGE.quoteTitle}
        eyebrow={PROGRAM_PAGE.quoteEyebrow}
        title={PROGRAM_PAGE.quoteTitle}
        body={PROGRAM_PAGE.quoteBody}
        href={SITE.enquiryUrl}
        cta={PROGRAM_PAGE.quoteCta}
      />
    </>
  );
}

/**
 * Coach standards — the program pages' trust-strip treatment, on the
 * same cream band, so the two surfaces read as one promise. Only the
 * Working With Children Check and first aid are credential claims;
 * the other two cards are operational.
 */
function CoachStandardsSection() {
  return (
    <Section aria-label={ABOUT_PAGE.standardsTitle} className="bg-[#FFF7F2]">
      <SectionHeading
        eyebrow={PROGRAM_PAGE.trustEyebrow}
        title={ABOUT_PAGE.standardsTitle}
        intro={ABOUT_PAGE.standardsIntro}
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2">
        {COACH_STANDARDS.map((standard) => (
          <li
            key={standard.title}
            className="flex flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#111]"
              style={{ backgroundColor: standard.ball.color }}
            >
              <ShieldCheck
                className="size-5"
                strokeWidth={2.5}
                style={{ color: standard.ball.fg }}
              />
            </span>
            <h3 className="mt-5 font-heading text-lg font-extrabold leading-snug text-[#111]">
              {standard.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80">
              {standard.body}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Live impact band — the homepage's section, verbatim. A failed fetch
 * degrades to the em-dash placeholders and per-key gaps degrade inside
 * getImpactStats, so the band always renders.
 */
async function ImpactBandSection() {
  const stats = await safeFetch(getImpactStats, IMPACT_FALLBACK);

  return <ImpactBand stats={stats} />;
}
