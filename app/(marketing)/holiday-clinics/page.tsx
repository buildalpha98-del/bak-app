import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/marketing/section";
import { ClinicsEmptyState } from "@/components/marketing/clinic-card";
import { ClinicFilters } from "@/components/marketing/clinic-filters";
import { getOpenHolidayClinics } from "@/lib/marketing/clinics";
import type { PublicClinic } from "@/lib/marketing/clinics-shared";
import { ACTIVE_KIDS_BLURB, BRAND, SITE } from "@/lib/marketing/content";

/** ISR — fresh clinic dates/spots within 5 minutes, no per-request DB hit. */
export const revalidate = 300;

const DESCRIPTION =
  "Multi-sport school holiday clinics across South-West Sydney. Pick a date and book online in about 60 seconds — NSW Active Kids vouchers accepted.";

export const metadata: Metadata = {
  title: `School Holiday Clinics — ${SITE.name}`,
  description: DESCRIPTION,
};

/**
 * /holiday-clinics — hero-lite orange band, then every open clinic
 * with client-side suburb/sport filters grouped by week. The fetch
 * is wrapped so a DB error renders the same friendly empty state as
 * "no dates yet" — never a broken page.
 */
export default async function HolidayClinicsPage() {
  let clinics: PublicClinic[] = [];
  try {
    clinics = await getOpenHolidayClinics();
  } catch {
    clinics = [];
  }

  return (
    <>
      {/* Hero-lite: court orange band with the ball-row breakout. */}
      <section
        aria-label="School holiday clinics"
        className="relative bg-[#E8712A]"
      >
        {/* Court-line arc — decorative, clipped inside the band. */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-56 size-[480px] rounded-full border-[3px] border-white/15" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
          <p className="inline-block -rotate-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[3px_3px_0_#111]">
            Book direct
          </p>
          <h1 className="mt-6 font-heading text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            School holiday clinics
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-medium leading-relaxed text-[#1A1A1A]">
            Full-throttle multi-sport days run by the coaches kids already
            know. Pick a date, book and pay online in about 60 seconds —{" "}
            {ACTIVE_KIDS_BLURB}.
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

      <Section aria-label="Upcoming clinic dates" className="bg-white">
        {clinics.length === 0 ? (
          <ClinicsEmptyState />
        ) : (
          <ClinicFilters clinics={clinics} />
        )}
      </Section>
    </>
  );
}
