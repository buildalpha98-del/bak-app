import { Suspense } from "react";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { HeroLite } from "@/components/marketing/hero-lite";
import { Section, SectionHeading } from "@/components/marketing/section";
import { EnquiryFormWithProgram } from "@/components/marketing/enquiry-form";
import {
  ENQUIRE_PAGE,
  ENQUIRE_STEPS,
  ENQUIRE_TRUST_POINTS,
} from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: ENQUIRE_PAGE.title,
  description: ENQUIRE_PAGE.description,
  alternates: { canonical: "/enquire" },
};

/**
 * /enquire — the B2B conversion path. Every school and centre lead the
 * site produces enters through the form on this page.
 *
 * Static. The form is a client component and the only thing reading
 * ?program= sits behind the Suspense boundary below, so the shell —
 * hero, headings, what-happens-next, trust strip — prerenders. Keep it
 * that way: hoisting the param read up here would turn the whole page
 * dynamic for one pre-ticked checkbox.
 */
export default function EnquirePage() {
  return (
    <>
      <HeroLite
        label={ENQUIRE_PAGE.title}
        eyebrow={ENQUIRE_PAGE.eyebrow}
        title={ENQUIRE_PAGE.title}
        intro={ENQUIRE_PAGE.intro}
      />

      <Section aria-label={ENQUIRE_PAGE.formTitle} className="bg-[#FFF7F2]">
        <SectionHeading
          eyebrow={ENQUIRE_PAGE.formEyebrow}
          title={ENQUIRE_PAGE.formTitle}
          intro={ENQUIRE_PAGE.formIntro}
        />

        <div className="mt-12 max-w-3xl">
          {/* useSearchParams() needs a Suspense boundary in Next 16.
              Only the form is inside it — the fallback is a same-shaped
              card, so the prerendered page never flashes an empty slot
              or jumps height when the form hydrates. */}
          <Suspense fallback={<EnquiryFormSkeleton />}>
            <EnquiryFormWithProgram />
          </Suspense>
        </div>
      </Section>

      <WhatHappensNext />

      <TrustStrip />
    </>
  );
}

/**
 * The suspended form's placeholder. Deliberately hand-rolled rather
 * than components/ui/skeleton: that primitive carries the dashboard's
 * tokens, and this has to read as the sticker card it is about to be
 * replaced by.
 */
function EnquiryFormSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border-2 border-[#111] bg-white p-6 shadow-[6px_6px_0_#111] sm:p-9"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          "sm:col-span-2",
          "",
          "",
          "",
          "",
        ].map((span, i) => (
          <div key={i} className={span}>
            <div className="h-4 w-28 rounded-full bg-[#1A1A1A]/10" />
            <div className="mt-2 h-12 w-full rounded-xl border-2 border-[#1A1A1A]/10 bg-[#1A1A1A]/5" />
          </div>
        ))}
      </div>
      <div className="mt-8 h-4 w-40 rounded-full bg-[#1A1A1A]/10" />
      <div className="mt-3 flex flex-wrap gap-3">
        {[80, 120, 110].map((w) => (
          <div
            key={w}
            style={{ width: w }}
            className="h-11 rounded-full border-2 border-[#1A1A1A]/10 bg-[#1A1A1A]/5"
          />
        ))}
      </div>
      <div className="mt-8 h-4 w-56 rounded-full bg-[#1A1A1A]/10" />
      <div className="mt-3 flex flex-wrap gap-3">
        {[140, 160, 130, 150].map((w) => (
          <div
            key={w}
            style={{ width: w }}
            className="h-11 rounded-full border-2 border-[#1A1A1A]/10 bg-[#1A1A1A]/5"
          />
        ))}
      </div>
      <div className="mt-8 h-4 w-48 rounded-full bg-[#1A1A1A]/10" />
      <div className="mt-2 h-32 w-full rounded-xl border-2 border-[#1A1A1A]/10 bg-[#1A1A1A]/5" />
      <div className="mt-9 h-13 w-52 rounded-full border-2 border-[#1A1A1A]/10 bg-[#1A1A1A]/5" />
    </div>
  );
}

/** Three numbered steps — sets the expectation the form's success panel then repeats. */
function WhatHappensNext() {
  return (
    <Section aria-label={ENQUIRE_PAGE.nextTitle} className="bg-white">
      <SectionHeading
        eyebrow={ENQUIRE_PAGE.nextEyebrow}
        title={ENQUIRE_PAGE.nextTitle}
        intro={ENQUIRE_PAGE.nextIntro}
      />

      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        {ENQUIRE_STEPS.map((step, i) => (
          <li
            key={step.title}
            className={
              "flex flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[5px_5px_0_var(--accent)]" +
              (i === 1 ? " md:rotate-1" : "")
            }
            style={{ "--accent": step.ball.color } as React.CSSProperties}
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#111] font-heading text-base font-extrabold"
              style={{ backgroundColor: step.ball.color, color: step.ball.fg }}
            >
              {i + 1}
            </span>
            <h3 className="mt-5 font-heading text-xl font-extrabold tracking-tight text-[#1A1A1A]">
              {step.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** The four standing credentials — no page-specific claims, all restated from content.ts. */
function TrustStrip() {
  return (
    <Section aria-label={ENQUIRE_PAGE.trustTitle} className="bg-[#1A1A1A]">
      <SectionHeading
        eyebrow={ENQUIRE_PAGE.trustEyebrow}
        title={ENQUIRE_PAGE.trustTitle}
        dark
      />

      <ul className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {ENQUIRE_TRUST_POINTS.map((point) => (
          <li key={point} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[#111] bg-[#FFD23F]"
            >
              <Check className="size-3.5 text-[#111]" strokeWidth={3} />
            </span>
            <span className="text-base font-medium leading-relaxed text-white">{point}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
