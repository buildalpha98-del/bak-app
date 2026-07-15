import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { StickerButton } from "@/components/marketing/sticker-button";
import { HeroLite } from "@/components/marketing/hero-lite";
import { CtaBand } from "@/components/marketing/cta-band";
import { HolidayClinicsSection } from "@/components/marketing/holiday-clinics-section";
import {
  adjacentPrograms,
  BALL_COLORS,
  getProgram,
  PROGRAM_PAGE,
  PROGRAMS,
  SITE,
  type BallColor,
  type Program,
} from "@/lib/marketing/content";

/**
 * ISR — this is a route-segment config, so it applies to all five
 * slugs even though only /programs/holiday-programs reads live data
 * (its embedded clinic cards). The other four are pure static copy
 * and simply re-render from the same content module; the 5-minute
 * window keeps holiday clinic dates and spot counts fresh without a
 * per-request DB hit, matching / and /holiday-clinics.
 */
export const revalidate = 300;

/** The five program pages are known at build time — prerender them all. */
export function generateStaticParams() {
  return PROGRAMS.map((program) => ({ slug: program.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const program = getProgram(slug);
  if (!program) return {};

  return {
    title: `${program.title} — ${SITE.name}`,
    description: program.metaDescription,
  };
}

/**
 * /programs/[slug] — one page per program, driven entirely by the
 * Program entry in lib/marketing/content.ts (no copy inline here).
 *
 * Funnel: "Request a quote" repeats top / middle / bottom, always to
 * /enquire?program=<slug>. Holiday programs is the exception — it is
 * parent-facing, so its primary CTAs point at /holiday-clinics and it
 * embeds the live clinic cards, keeping the quote CTA as the
 * secondary path for centres and schools.
 *
 * Contrast (AA): hero H1 is white on #E8712A (heading size only);
 * hero body copy is near-black #1A1A1A (5.66:1). Accent chips use the
 * palette's verified `fg` pairing. The trust strip is white on
 * #1A1A1A (17.4:1).
 */
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = getProgram(slug);
  if (!program) notFound();

  const isHolidayPrograms = program.slug === "holiday-programs";

  return (
    <>
      <ProgramHero program={program} parentFacing={isHolidayPrograms} />

      <Section aria-label={PROGRAM_PAGE.overviewTitle} className="bg-white">
        <SectionHeading
          eyebrow={program.eyebrow}
          title={PROGRAM_PAGE.overviewTitle}
        />

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Description paragraphs */}
          <div className="space-y-5">
            {program.description.map((paragraph, i) => (
              <p
                key={i}
                className="text-base leading-relaxed text-[#1A1A1A]/80 sm:text-lg"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Highlights grid — sticker list in the program's accent */}
          <ul className="grid content-start gap-3">
            {program.highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-start gap-3 rounded-2xl border-2 border-[#111] bg-white p-4 shadow-[4px_4px_0_var(--accent)]"
                style={
                  { "--accent": program.accent.color } as React.CSSProperties
                }
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[#111]"
                  style={{ backgroundColor: program.accent.color }}
                >
                  <Check
                    className="size-3.5"
                    strokeWidth={3}
                    style={{ color: program.accent.fg }}
                  />
                </span>
                <span className="text-sm font-semibold leading-snug text-[#1A1A1A]">
                  {highlight}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* What a session actually looks like */}
      <Section aria-label={PROGRAM_PAGE.sessionShapeTitle} className="bg-[#FFF7F2]">
        <SectionHeading
          eyebrow={PROGRAM_PAGE.sessionShapeEyebrow}
          title={PROGRAM_PAGE.sessionShapeTitle}
        />

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {program.sessionShape.map((sentence, i) => (
            <li
              key={i}
              className={
                "rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]" +
                (i === 1 ? " md:rotate-1" : "")
              }
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-full border-2 border-[#111] font-heading text-base font-extrabold"
                style={{
                  backgroundColor: program.accent.color,
                  color: program.accent.fg,
                }}
              >
                {i + 1}
              </span>
              <p className="mt-5 text-sm leading-relaxed text-[#1A1A1A]/80">
                {sentence}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* CTA #2 — middle of the page */}
      <QuoteBand program={program} />

      {/* Live clinic cards — holiday programs only */}
      {isHolidayPrograms && (
        <HolidayClinicsSection
          limit={6}
          columns={3}
          eyebrow={PROGRAM_PAGE.clinicsSectionEyebrow}
          title={PROGRAM_PAGE.clinicsSectionTitle}
          intro={PROGRAM_PAGE.clinicsSectionIntro}
        />
      )}

      {/* What kids walk away with */}
      <Section aria-label={PROGRAM_PAGE.outcomesTitle} className="bg-white">
        <SectionHeading
          eyebrow={PROGRAM_PAGE.outcomesEyebrow}
          title={PROGRAM_PAGE.outcomesTitle}
        />

        <ul className="mt-12 flex flex-wrap gap-x-5 gap-y-6">
          {program.outcomes.map((outcome) => (
            <li key={outcome}>
              <span className="inline-flex min-h-11 items-center gap-2.5 rounded-full border-2 border-[#111] bg-white px-5 py-2 font-heading text-sm font-bold text-[#111] shadow-[3px_3px_0_#111] sm:text-base">
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-full border-2 border-[#111]"
                  style={{ backgroundColor: program.accent.color }}
                />
                {outcome}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <TrustStrip program={program} />

      <CrossLinks program={program} />

      {/* CTA #3 — bottom of the page */}
      <QuoteBand program={program} />
    </>
  );
}

/** The quote destination — the single place the funnel URL is built. */
function quoteHref(program: Program): string {
  return `${SITE.enquiryUrl}?program=${program.slug}`;
}

/**
 * The program hero — the shared HeroLite band carrying the tagline,
 * the ages chip in the program's accent, and CTA #1. Deliberately no
 * photography: the program hero images are placeholders that do not
 * exist yet, so the decorative treatment carries the page.
 */
function ProgramHero({
  program,
  parentFacing,
}: {
  program: Program;
  parentFacing: boolean;
}) {
  return (
    <HeroLite label={program.title} eyebrow={program.eyebrow} title={program.title}>
      <p className="mt-5 max-w-2xl font-heading text-xl font-bold leading-snug text-[#1A1A1A] sm:text-2xl">
        {program.tagline}
      </p>

      {/* Ages chip in the program's accent colour */}
      <p
        className="mt-6 inline-block rounded-full border-2 border-[#111] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0_#111]"
        style={{
          backgroundColor: program.accent.color,
          color: program.accent.fg,
        }}
      >
        {program.ages}
      </p>

      <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
        {parentFacing ? (
          <>
            <StickerButton href="/holiday-clinics">
              {PROGRAM_PAGE.clinicsCta}
              <ArrowRight className="size-5" aria-hidden="true" />
            </StickerButton>
            <StickerButton href={quoteHref(program)} fill="white">
              {PROGRAM_PAGE.quoteCta}
            </StickerButton>
          </>
        ) : (
          <StickerButton href={quoteHref(program)}>
            {PROGRAM_PAGE.quoteCta}
            <ArrowRight className="size-5" aria-hidden="true" />
          </StickerButton>
        )}
      </div>
    </HeroLite>
  );
}

/**
 * The repeated quote band — CTA #2 (middle) and CTA #3 (bottom).
 * Near-black, yellow sticker accents (the B2B band's treatment), so
 * the two dark breaks bracket the page's copy sections. Always aimed
 * at centres and schools, including on the parent-facing holiday
 * programs page: parents get the clinics CTA in the hero and again
 * on the live clinic cards, so mixing a "See clinic dates" button
 * into a band headed "Schools & centres" would only muddle both.
 *
 * No aria-label: the band renders twice per page, so labelling it
 * would put two identically-named landmarks in the a11y tree. Its
 * <h2> already names it in the heading hierarchy.
 */
function QuoteBand({ program }: { program: Program }) {
  return (
    <CtaBand
      eyebrow={PROGRAM_PAGE.quoteEyebrow}
      title={PROGRAM_PAGE.quoteTitle}
      body={PROGRAM_PAGE.quoteBody}
      href={quoteHref(program)}
      cta={PROGRAM_PAGE.quoteCta}
    />
  );
}

/**
 * Trust strip — Working With Children Check and first aid on every
 * program, plus the program-specific proof points, all declared on
 * the Program entry. Cream band so it reads as reassurance rather
 * than another sales break.
 */
function TrustStrip({ program }: { program: Program }) {
  return (
    <Section aria-label={PROGRAM_PAGE.trustTitle} className="bg-[#FFF7F2]">
      <SectionHeading
        eyebrow={PROGRAM_PAGE.trustEyebrow}
        title={PROGRAM_PAGE.trustTitle}
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2">
        {program.trustPoints.map((point) => (
          <li
            key={point}
            className="flex items-start gap-4 rounded-2xl border-2 border-[#111] bg-white p-6 shadow-[4px_4px_0_#111]"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#111]"
              style={{ backgroundColor: program.accent.color }}
            >
              <ShieldCheck
                className="size-5"
                strokeWidth={2.5}
                style={{ color: program.accent.fg }}
              />
            </span>
            <span className="font-heading text-base font-bold leading-snug text-[#111]">
              {point}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Cross-links — the programs either side of this one by age, plus
 * holiday clinics (always, since that is the one thing a parent
 * landing on any program page can book right now).
 */
function CrossLinks({ program }: { program: Program }) {
  const neighbours = adjacentPrograms(program.slug);

  return (
    <Section aria-label={PROGRAM_PAGE.crossLinkTitle} className="bg-white">
      <SectionHeading
        eyebrow={PROGRAM_PAGE.crossLinkEyebrow}
        title={PROGRAM_PAGE.crossLinkTitle}
      />

      <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-6">
        {neighbours.map((neighbour) => (
          <li key={neighbour.slug}>
            <CrossLink
              href={`/programs/${neighbour.slug}`}
              label={neighbour.title}
              dot={neighbour.accent}
            />
          </li>
        ))}
        {program.slug !== "holiday-programs" && (
          <li>
            <CrossLink
              href="/holiday-clinics"
              label={PROGRAM_PAGE.clinicsLinkLabel}
              dot={BALL_COLORS.yellow}
            />
          </li>
        )}
      </ul>
    </Section>
  );
}

/**
 * A cross-link pill. Composes StickerButton rather than restyling it:
 * the outline, hard shadow and press treatment must come from one
 * place, so the only thing added here is the ball-colour dot, which
 * rides along as a child.
 */
function CrossLink({
  href,
  label,
  dot,
}: {
  href: string;
  label: string;
  dot: BallColor;
}) {
  return (
    <StickerButton href={href} size="sm" fill="white" className="group">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full border-2 border-[#111]"
        style={{ backgroundColor: dot.color }}
      />
      {label}
      <ArrowRight
        className="size-4 transition-transform duration-200 group-hover:translate-x-1"
        aria-hidden="true"
      />
    </StickerButton>
  );
}

