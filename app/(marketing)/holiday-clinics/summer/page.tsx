import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Section } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { SummerSelector } from "./selector";

export const dynamic = "force-dynamic";

export default function SummerClinicsPage() {
  if (!summerClinicsEnabled()) notFound();
  const sandbox = process.env.VERCEL_ENV !== "production";
  return (
    <>
      <HeroLite label="Summer clinics" eyebrow={sandbox ? "Sandbox test booking" : "Holiday clinics"} title="Summer Sports Holiday Program"
        intro={`Six themed sessions in Casula and Auburn. Ages 4–15, 10 am–1 pm each day. Book all your children together.${sandbox ? " Use test details only." : ""}`} />
      <Section aria-label="Choose clinic dates"><SummerSelector bookingKey={randomUUID()} /></Section>
    </>
  );
}
