import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { SITE, phoneHref } from "@/lib/marketing/content";
import { SummerSelector } from "./selector";

export const dynamic = "force-dynamic";

export default function SummerClinicsPage() {
  if (!summerClinicsEnabled()) notFound();
  const sandbox = process.env.VERCEL_ENV !== "production";
  return (
    <>
      <HeroLite label="Summer clinics" eyebrow={sandbox ? "Sandbox test booking" : "Holiday clinics"} title="Summer Sports Holiday Program"
        intro={`Six themed sessions in Casula and Auburn. Ages 4–15, 10 am–1 pm each day. Book all your children together.${sandbox ? " Use test details only." : ""}`} />
      <Section aria-label="Choose clinic dates">
        <aside aria-labelledby="clinic-voucher-heading" className="mx-auto mb-8 max-w-3xl rounded-xl border p-4">
          <h2 id="clinic-voucher-heading" className="font-bold">Using a NSW Active and Creative Kids voucher?</h2>
          <p className="mt-1">Contact us before paying so we can check eligibility, clinic availability and any balance due. Keep your voucher code handy for payment.</p>
          <div className="mt-2 flex flex-wrap gap-x-5">
            <a className="inline-flex min-h-11 items-center underline" href={phoneHref()}>Call {SITE.phone}</a>
            <a className="inline-flex min-h-11 items-center underline"
              href={`mailto:${SITE.email}?subject=${encodeURIComponent("Summer clinic voucher enquiry")}`}>Email about a voucher</a>
          </div>
        </aside>
        <SummerSelector bookingKey={randomUUID()} />
      </Section>
    </>
  );
}
