import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SITE } from "@/lib/marketing/content";

/**
 * B2B call-out band — near-black break in the page rhythm aimed at
 * centre directors and school sport coordinators, not parents.
 */
export function B2bBand() {
  return (
    <section aria-label="For schools and childcare centres" className="bg-[#1A1A1A]">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <p className="inline-block -skew-x-3 bg-[#E8712A] px-3 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#1A1A1A]">
            <span className="inline-block skew-x-3">
              Schools &amp; centres
            </span>
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
          className="inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-full bg-[#E8712A] px-8 font-heading text-base font-bold text-[#1A1A1A] transition-transform hover:-translate-y-0.5 hover:bg-[#F5A567]"
        >
          Enquire now
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
