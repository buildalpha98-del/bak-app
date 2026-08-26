import type { Metadata } from "next";
import Image from "next/image";
import { HeroLite } from "@/components/marketing/hero-lite";
import { Section, SectionHeading } from "@/components/marketing/section";
import { PartnerStrip } from "@/components/marketing/partner-strip";
import { FaqList } from "@/components/marketing/faq-list";
import { CtaBand } from "@/components/marketing/cta-band";
import { StickerButton } from "@/components/marketing/sticker-button";
import { JsonLd } from "@/components/marketing/json-ld";
import { faqPageJsonLd } from "@/lib/marketing/jsonld";
import { CHILDCARE_PAGE } from "@/lib/marketing/deep-content";
import { PROGRAM_PAGE, SITE, phoneHref } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Childcare & ELC Programs",
  description: CHILDCARE_PAGE.description,
  alternates: { canonical: "/childcare" },
};

/**
 * /childcare — the flagship ELC landing page (deep-content pack §2).
 * Replaced /programs/childcare, which 308s here; the childcare entry in
 * PROGRAMS still powers homepage cards, but this page owns the copy.
 * Childcare is the volume audience — 50+ centres vs 10+ schools — so
 * this page mirrors /schools in depth and structure.
 */
export default function ChildcarePage() {
  return (
    <>
      <HeroLite
        label={CHILDCARE_PAGE.title}
        eyebrow={CHILDCARE_PAGE.eyebrow}
        title={CHILDCARE_PAGE.title}
        intro={CHILDCARE_PAGE.intro}
      >
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <StickerButton href={SITE.enquiryUrl}>
            {CHILDCARE_PAGE.cta}
          </StickerButton>
          <StickerButton href={phoneHref()} fill="white">
            Call {SITE.phone}
          </StickerButton>
        </div>
      </HeroLite>

      {/* ── The three pillars: golden window / how centres run / EYLF ── */}
      <Section aria-label="Why early-years movement" className="bg-white">
        <div className="grid gap-6 md:grid-cols-3">
          {CHILDCARE_PAGE.sections.map((s) => (
            <article
              key={s.title}
              className="rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
            >
              <span
                aria-hidden
                className="inline-block size-5 rounded-full border-2 border-[#111]"
                style={{ backgroundColor: s.ball.color }}
              />
              <h2 className="mt-4 font-heading text-lg font-extrabold tracking-tight text-[#111]">
                {s.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80 sm:text-base">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* Real footage still (showreel, 2026-08): a session mid-flight. */}
      <Section aria-label="A Build Alpha Kids session in a childcare centre" className="bg-white pt-0">
        <div className="mx-auto max-w-4xl rotate-1 rounded-[2rem] border-2 border-[#111] bg-white p-2.5 shadow-[8px_8px_0_#111] sm:p-3">
          <Image
            src="/images/marketing/childcare-session.jpg"
            alt="A Build Alpha Kids coach runs a ball-skills session with toddlers between mini hoops at a Sydney childcare centre"
            width={1600}
            height={900}
            sizes="(min-width: 1024px) 896px, 100vw"
            className="h-auto w-full rounded-[1.4rem]"
          />
        </div>
      </Section>

      {/* ── What your centre receives + safety ── */}
      <Section aria-label={CHILDCARE_PAGE.receivesTitle} className="bg-[#FFF7F2]">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Every week"
              title={CHILDCARE_PAGE.receivesTitle}
            />
            <ul className="mt-8 space-y-3">
              {CHILDCARE_PAGE.receives.map((point) => (
                <li key={point} className="flex gap-3 text-sm sm:text-base">
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block size-2.5 shrink-0 rounded-full border-2 border-[#111] bg-[#FFD23F]"
                  />
                  <span className="text-[#1A1A1A]/85">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading eyebrow="Non-negotiable" title={CHILDCARE_PAGE.safetyTitle} />
            <p className="mt-8 rounded-2xl border-2 border-[#111] bg-white p-6 text-sm leading-relaxed text-[#1A1A1A]/85 shadow-[4px_4px_0_#111] sm:text-base">
              {CHILDCARE_PAGE.safety}
            </p>
          </div>
        </div>
      </Section>

      <PartnerStrip />

      <FaqList
        eyebrow={CHILDCARE_PAGE.faqsEyebrow}
        title={CHILDCARE_PAGE.faqsTitle}
        faqs={CHILDCARE_PAGE.faqs}
        className="bg-white"
      />
      <JsonLd data={faqPageJsonLd(CHILDCARE_PAGE.faqs)} />

      <CtaBand
        eyebrow="Childcare & ELCs"
        title="Want this running at your centre?"
        body={PROGRAM_PAGE.quoteBody}
        href={SITE.enquiryUrl}
        cta={CHILDCARE_PAGE.cta}
      />
    </>
  );
}
