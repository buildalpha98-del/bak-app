import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { StickerButton } from "@/components/marketing/sticker-button";
import {
  ClinicCard,
  ClinicsEmptyState,
} from "@/components/marketing/clinic-card";
import { getOpenHolidayClinics } from "@/lib/marketing/clinics";
import type { PublicClinic } from "@/lib/marketing/clinics-shared";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import {
  adjacentPrograms,
  BRAND,
  getProgram,
  PROGRAM_PAGE,
  PROGRAMS,
  SITE,
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
    description: `${program.tagline} ${program.description[0]}`,
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
            {program.description.map((paragraph) => (
              <p
                key={paragraph.slice(0, 40)}
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
          eyebrow="On the ground"
          title={PROGRAM_PAGE.sessionShapeTitle}
        />

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {program.sessionShape.map((sentence, i) => (
            <li
              key={sentence.slice(0, 40)}
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
      {isHolidayPrograms && <HolidayClinicsSection />}

      {/* What kids walk away with */}
      <Section aria-label={PROGRAM_PAGE.outcomesTitle} className="bg-white">
        <SectionHeading eyebrow="The payoff" title={PROGRAM_PAGE.outcomesTitle} />

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
 * Hero-lite: court orange, arcs, yellow sticker eyebrow, ball-row
 * breakout at the bottom edge. Deliberately no photography — the
 * program hero images are placeholders that do not exist yet, so the
 * decorative treatment carries the page (same call as /holiday-clinics).
 * Carries CTA #1.
 */
function ProgramHero({
  program,
  parentFacing,
}: {
  program: Program;
  parentFacing: boolean;
}) {
  return (
    <section aria-label={program.title} className="relative bg-[#E8712A]">
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-56 size-[480px] rounded-full border-[3px] border-white/15" />
        <div className="absolute -bottom-72 -left-32 size-[520px] rounded-full border-[3px] border-white/15" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
        <p className="inline-block -rotate-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[3px_3px_0_#111]">
          {program.eyebrow}
        </p>

        <h1 className="mt-6 font-heading text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          {program.title}
        </h1>

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
      </div>

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
 */
function QuoteBand({ program }: { program: Program }) {
  return (
    <section aria-label={PROGRAM_PAGE.quoteTitle} className="bg-[#1A1A1A]">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <p className="inline-block -rotate-1 rounded-full border-2 border-[#111] bg-[#FFD23F] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[2px_2px_0_#E8712A]">
            {PROGRAM_PAGE.quoteEyebrow}
          </p>
          <h2 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {PROGRAM_PAGE.quoteTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            {PROGRAM_PAGE.quoteBody}
          </p>
        </div>

        <StickerButton
          href={quoteHref(program)}
          shadow="orange"
          className="shrink-0"
        >
          {PROGRAM_PAGE.quoteCta}
          <ArrowRight className="size-5" aria-hidden="true" />
        </StickerButton>
      </div>
    </section>
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
      <SectionHeading eyebrow="More" title={PROGRAM_PAGE.crossLinkTitle} />

      <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-6">
        {neighbours.map((neighbour) => (
          <li key={neighbour.slug}>
            <CrossLink
              href={`/programs/${neighbour.slug}`}
              label={neighbour.title}
              dot={neighbour.accent.color}
            />
          </li>
        ))}
        {program.slug !== "holiday-programs" && (
          <li>
            <CrossLink
              href="/holiday-clinics"
              label="School holiday clinics"
              dot="#FFD23F"
            />
          </li>
        )}
      </ul>
    </Section>
  );
}

function CrossLink({
  href,
  label,
  dot,
}: {
  href: string;
  label: string;
  dot: string;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-2.5 rounded-full border-2 border-[#111] bg-white px-5 py-2 font-heading text-sm font-bold text-[#111] shadow-[3px_3px_0_#111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#111] sm:text-base"
    >
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full border-2 border-[#111]"
        style={{ backgroundColor: dot }}
      />
      {label}
      <ArrowRight
        className="size-4 transition-transform duration-200 group-hover:translate-x-1"
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Live clinic cards on the holiday programs page — the homepage
 * pattern verbatim, so a DB hiccup or an empty calendar renders the
 * friendly empty state instead of breaking the page. Refreshes with
 * the segment's ISR window (revalidate 300).
 */
async function HolidayClinicsSection() {
  const clinics = await safeFetch<PublicClinic[]>(
    () => getOpenHolidayClinics(6),
    []
  );

  return (
    <Section aria-label={PROGRAM_PAGE.clinicsSectionTitle} className="bg-white">
      <SectionHeading
        eyebrow={PROGRAM_PAGE.clinicsSectionEyebrow}
        title={PROGRAM_PAGE.clinicsSectionTitle}
        intro={PROGRAM_PAGE.clinicsSectionIntro}
      />

      {clinics.length === 0 ? (
        <div className="mt-12">
          <ClinicsEmptyState />
        </div>
      ) : (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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
