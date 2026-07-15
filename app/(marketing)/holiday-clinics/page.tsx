import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { ClinicsEmptyState } from "@/components/marketing/clinic-card";
import { ClinicFilters } from "@/components/marketing/clinic-filters";
import { getOpenHolidayClinics } from "@/lib/marketing/clinics";
import type { PublicClinic } from "@/lib/marketing/clinics-shared";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import { ACTIVE_KIDS_BLURB, SITE } from "@/lib/marketing/content";

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
  const clinics = await safeFetch<PublicClinic[]>(getOpenHolidayClinics, []);

  return (
    <>
      <HeroLite
        label="School holiday clinics"
        eyebrow="Book direct"
        title="School holiday clinics"
        intro={
          <>
            Full-throttle multi-sport days run by the coaches kids already
            know. Pick a date, book and pay online in about 60 seconds —{" "}
            {ACTIVE_KIDS_BLURB}.
          </>
        }
      />

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
