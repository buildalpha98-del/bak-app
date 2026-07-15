import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { StickerButton } from "@/components/marketing/sticker-button";
import { ACTIVE_KIDS_BLURB, BRAND, HOMEPAGE } from "@/lib/marketing/content";

/**
 * Homepage hero — court orange, loud. Full-bleed orange with the real
 * badge crest as the visual, sticker-style CTAs (thick black outline,
 * hard shadow) and the illustrated ball row breaking out of the
 * hero's bottom edge. Mobile-first: copy stacks above the crest.
 *
 * Contrast rules (AA): the H1 is white (permitted — heading size is
 * far above 24px; white on #E8712A is 3.08:1, passing only at large
 * sizes); all body copy sits in near-black #1A1A1A, which clears
 * 5.66:1 on #E8712A. Sticker CTAs are black-on-yellow (13.1:1) and
 * black-on-white (18.9:1).
 */
export function Hero() {
  return (
    <section
      aria-label="Build Alpha Kids — multi-sport coaching for kids"
      className="relative bg-[#E8712A]"
    >
      {/* Court-line arcs — decorative, clipped inside the hero. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        {/* Centre circle, off to the left like a court centre line */}
        <div className="absolute -left-40 top-1/2 size-[480px] -translate-y-1/2 rounded-full border-[3px] border-white/15" />
        {/* Keyway arc, bottom right */}
        <div className="absolute -bottom-64 -right-32 size-[560px] rounded-full border-[3px] border-white/15" />
        {/* Baseline */}
        <div className="absolute inset-y-0 left-[46%] hidden w-[3px] bg-white/10 lg:block" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-24">
        <div>
          {/* Yellow sticker eyebrow — one of the hero's two rotated elements. */}
          <p className="inline-block -rotate-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[3px_3px_0_#111]">
            {ACTIVE_KIDS_BLURB}
          </p>

          <h1 className="mt-7 font-heading text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight text-white">
            Where kids build{" "}
            <span className="relative inline-block">
              <span className="relative z-10">skills for life</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1 h-[0.28em] -skew-x-6 bg-[#111]/90"
              />
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-[#1A1A1A] sm:text-xl">
            {HOMEPAGE.heroSub}
          </p>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <StickerButton href="/holiday-clinics">
              Book a holiday clinic
              <ArrowRight className="size-5" aria-hidden="true" />
            </StickerButton>
            <StickerButton href="/enquire" fill="white">
              Enquire for your school
            </StickerButton>
          </div>
        </div>

        {/* The real badge crest, big, on a cream sticker card (the hero's
            second rotated element). Swapping in action photography later
            means replacing this block only. */}
        <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
          <div className="rotate-2 rounded-[2rem] border-2 border-[#111] bg-[#FFF7F2] p-8 shadow-[8px_8px_0_#111] sm:p-10">
            <Image
              src={BRAND.logo}
              alt="Build Alpha Kids club crest — fanned sports balls behind the club banner"
              width={513}
              height={339}
              priority
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>

      {/* Illustrated ball row breaking out of the hero's bottom edge —
          absolutely pinned to the edge and translated half-out, so the
          balls straddle the orange/white boundary. The section below
          clears the overhang with its own top padding. */}
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
          className="h-16 w-auto sm:h-20 lg:h-24"
        />
        <Image
          src={BRAND.ballsRowAlt}
          alt=""
          width={298}
          height={96}
          unoptimized
          className="hidden h-20 w-auto md:block lg:h-24"
        />
        <Image
          src={BRAND.ballsRow}
          alt=""
          width={298}
          height={96}
          unoptimized
          className="hidden h-24 w-auto xl:block"
        />
      </div>
    </section>
  );
}
