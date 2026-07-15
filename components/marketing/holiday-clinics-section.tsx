import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Section, SectionHeading } from "@/components/marketing/section";
import { StickerButton } from "@/components/marketing/sticker-button";
import {
  ClinicCard,
  ClinicsEmptyState,
} from "@/components/marketing/clinic-card";
import { getOpenHolidayClinics } from "@/lib/marketing/clinics";
import type { PublicClinic } from "@/lib/marketing/clinics-shared";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import { PROGRAM_PAGE } from "@/lib/marketing/content";

/**
 * The shared live-clinics section — used by the homepage (4 clinics,
 * 4-up) and the holiday programs page (6 clinics, 3-up). SERVER ONLY:
 * it reads through the service-role client.
 *
 * Failure posture: the fetch is wrapped in safeFetch, so a DB hiccup
 * or an empty calendar both render the friendly empty state rather
 * than breaking the page. Freshness comes from the host page's ISR
 * window (both are revalidate 300).
 */
const COLUMNS = {
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
} as const;

export async function HolidayClinicsSection({
  limit,
  columns,
  eyebrow,
  title,
  intro,
}: {
  limit: number;
  columns: keyof typeof COLUMNS;
  eyebrow: string;
  title: string;
  intro: string;
}) {
  const clinics = await safeFetch<PublicClinic[]>(
    () => getOpenHolidayClinics(limit),
    []
  );

  return (
    <Section aria-label={title} className="bg-white">
      <SectionHeading eyebrow={eyebrow} title={title} intro={intro} />

      {clinics.length === 0 ? (
        <div className="mt-12">
          <ClinicsEmptyState />
        </div>
      ) : (
        <div className={cn("mt-12 grid gap-6 sm:grid-cols-2", COLUMNS[columns])}>
          {clinics.map((clinic) => (
            <ClinicCard key={clinic.id} clinic={clinic} />
          ))}
        </div>
      )}

      <div className="mt-12">
        <StickerButton href="/holiday-clinics">
          {PROGRAM_PAGE.clinicsCta}
          <ArrowRight className="size-5" aria-hidden="true" />
        </StickerButton>
      </div>
    </Section>
  );
}
