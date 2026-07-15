import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SITE } from "@/lib/marketing/content";

/**
 * B2B call-out band — near-black break in the page rhythm aimed at
 * centre directors and school sport coordinators, not parents.
 * Yellow sticker accents on dark (black-on-yellow 13.1:1; white
 * heading on #1A1A1A 17.4:1).
 */
export function B2bBand() {
  return (
    <section aria-label="For schools and childcare centres" className="bg-[#1A1A1A]">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <p className="inline-block -rotate-1 rounded-full border-2 border-[#111] bg-[#FFD23F] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[2px_2px_0_#E8712A]">
            Schools &amp; centres
          </p>
          <h2 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Bring Build Alpha Kids to your school or centre
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            Qualified coaches, curriculum-friendly sessions and zero extra
            admin — trusted by schools and centres across{" "}
            {SITE.serviceArea}.
          </p>
        </div>
        <Link
          href={SITE.enquiryUrl}
          className="inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-8 font-heading text-base font-bold text-[#111] shadow-[4px_4px_0_#E8712A] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#E8712A]"
        >
          Enquire now
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
