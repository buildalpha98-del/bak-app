import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ACTIVE_KIDS_BLURB, HOMEPAGE } from "@/lib/marketing/content";

/**
 * Homepage hero — full-bleed orange, oversized heading, action
 * visual on the right. Mobile-first: copy stacks above the visual.
 *
 * Contrast rules (AA): the H1 is white (permitted — heading size is
 * far above 24px); all body copy and the badge sit in near-black
 * #1A1A1A, which clears 5.8:1 on #E8712A. The primary CTA is a white
 * button with deep-orange text; the secondary is a near-black outline.
 */
export function Hero() {
  return (
    <section
      aria-label="Build Alpha Kids — multi-sport coaching for kids"
      className="overflow-hidden bg-[#E8712A]"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <p className="inline-block -skew-x-3 bg-[#1A1A1A] px-3 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-[#FFF7F2]">
            <span className="inline-block skew-x-3">{ACTIVE_KIDS_BLURB}</span>
          </p>

          <h1 className="mt-6 font-heading text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight text-white">
            Where kids build{" "}
            <span className="relative inline-block">
              <span className="relative z-10">skills for life</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1 h-[0.28em] -skew-x-6 bg-[#1A1A1A]/90"
              />
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-[#1A1A1A] sm:text-xl">
            {HOMEPAGE.heroSub}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/holiday-clinics"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-8 font-heading text-base font-bold text-[#993C1D] shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5 hover:bg-[#FFF7F2]"
            >
              Book a holiday clinic
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <Link
              href="/enquire"
              className="inline-flex h-13 items-center justify-center rounded-full border-2 border-[#1A1A1A] px-8 font-heading text-base font-bold text-[#1A1A1A] transition-colors hover:bg-[#1A1A1A] hover:text-[#FFF7F2]"
            >
              Enquire for your school
            </Link>
          </div>
        </div>

        {/*
          Hero visual. Real action photography lands later — when it
          does, replace the aria-hidden composition below with a single
          next/image (paths live in lib/marketing/content.ts), e.g.:

          <Image src="/images/marketing/holiday-programs-hero.jpg"
            alt="Kids mid-game at a Build Alpha Kids holiday clinic"
            fill priority className="object-cover" />

          Until then: a bold geometric composition in the brand palette
          so the hero never renders a broken image.
        */}
        <div
          aria-hidden="true"
          className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2.5rem] bg-[#993C1D] shadow-2xl shadow-black/20 lg:max-w-none"
        >
          {/* Dotted texture */}
          <div className="absolute inset-0 bg-[radial-gradient(#FFF7F2_1.5px,transparent_1.5px)] [background-size:22px_22px] opacity-25" />
          {/* Cream sun, top right */}
          <div className="absolute -right-16 -top-16 size-56 rounded-full bg-[#FFF7F2]" />
          {/* Orange ring orbiting the sun */}
          <div className="absolute right-16 top-24 size-24 rounded-full border-[10px] border-[#E8712A]" />
          {/* Near-black speed stripes, skewed like the card accents */}
          <div className="absolute -left-8 bottom-36 h-10 w-3/4 -skew-x-12 bg-[#1A1A1A]" />
          <div className="absolute -left-8 bottom-20 h-10 w-1/2 -skew-x-12 bg-[#1A1A1A]/70" />
          {/* Cream quarter-pipe, bottom right */}
          <div className="absolute -bottom-24 -right-24 size-72 rounded-full bg-[#E8712A]" />
          <div className="absolute -bottom-28 -right-28 size-72 rounded-full border-[12px] border-[#FFF7F2]" />
        </div>
      </div>
    </section>
  );
}
