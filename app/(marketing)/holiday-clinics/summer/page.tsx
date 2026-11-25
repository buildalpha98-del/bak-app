import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { SummerSelector } from "./selector";

export const dynamic = "force-dynamic";

export default function SummerClinicsPage() {
  if (!summerClinicsEnabled()) notFound();
  return (
    <>
      <HeroLite label="Summer clinics" eyebrow="Sandbox test booking" title="Summer Sports Holiday Program"
        intro="Six themed sessions in Casula and Auburn. Ages 4–15, 10 am–1 pm each day. Book one child at a time. Use test details only." />
      <Section aria-label="Choose clinic dates"><SummerSelector bookingKey={randomUUID()} /></Section>
    </>
  );
}
