import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { StickerButton } from "@/components/marketing/sticker-button";
import { SummerSelector } from "./selector";

export const dynamic = "force-dynamic";

export default function SummerClinicsPage() {
  if (!summerClinicsEnabled()) notFound();
  const sandbox = process.env.VERCEL_ENV !== "production";
  return (
    <>
      <HeroLite
        label="Summer clinics"
        eyebrow={sandbox ? "Sandbox test booking" : "22 December – 14 January"}
        title="Summer Sports Holiday Program"
        intro={`Six themed sports days in Casula and Auburn for ages 4–15. Every session runs 10 am–1 pm.${sandbox ? " Use test details only." : ""}`}
      >
        <p className="mt-4 text-base font-bold text-[#111]">One day $50 · Any three days $120 per child</p>
        <p className="mt-1 text-sm font-medium text-[#111]">Mix locations and book siblings in one checkout.</p>
        <StickerButton href="#clinic-dates" className="mt-6">Choose clinic dates</StickerButton>
      </HeroLite>
      <Section id="clinic-dates" tabIndex={-1} aria-labelledby="clinic-dates-heading" className="scroll-mt-24 pt-14">
        <div className="mx-auto mb-5 max-w-3xl">
          <h2 id="clinic-dates-heading" className="font-heading text-2xl font-extrabold">Choose your dates</h2>
          <p className="mt-2">Pick one or three dates for each child. You can add siblings below.</p>
        </div>
        <SummerSelector bookingKey={randomUUID()} voucherKey={randomUUID()} />
      </Section>
    </>
  );
}
