import { ArrowRight } from "lucide-react";
import { StickerButton } from "@/components/marketing/sticker-button";
import { BallRowBreakout } from "@/components/marketing/hero-lite";
import { HOMEPAGE } from "@/lib/marketing/content";
import { HeroVideo } from "@/components/marketing/hero-video";

/**
 * Homepage hero — court orange, loud. Full-bleed orange with the real
 * badge crest as the visual, sticker-style CTAs (thick black outline,
 * hard shadow) and the illustrated ball row breaking out of the
 * hero's bottom edge. Mobile-first: copy stacks above the crest.
 *
 * Deliberately NOT built on <HeroLite />: this is a two-column grid
 * carrying the crest, a marker-underlined H1 and its own deeper
 * padding, so it shares the BallRowBreakout and nothing else.
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
            {HOMEPAGE.heroEyebrow}
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

          {/* B2B first (owner-directed 2026-07-18): schools and childcare
              are the primary audience, so the quote CTA leads and the
              parent path rides second. */}
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <StickerButton href="/enquire">
              Get a quote for your school or centre
              <ArrowRight className="size-5" aria-hidden="true" />
            </StickerButton>
            <StickerButton href="/holiday-clinics" fill="white">
              Parents: holiday clinics
            </StickerButton>
          </div>
        </div>

        {/* The showreel, in the same rotated sticker card the crest
            occupied ("swapping in action photography means replacing
            this block only" — this is that swap, 2026-08). The crest
            lives on inside HeroVideo as the server-rendered poster, so
            it is still the LCP element and the sizes maths still
            applies; the slim padding keeps a cream sticker frame
            around the footage without shrinking it. */}
        <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
          <div className="rotate-2 rounded-[2rem] border-2 border-[#111] bg-[#FFF7F2] p-2.5 shadow-[8px_8px_0_#111] sm:p-3">
            <HeroVideo />
          </div>
        </div>
      </div>

      {/* Illustrated ball row breaking out of the hero's bottom edge.
          The taller three-strip variant — this hero is the only band
          with the height to carry it. */}
      <BallRowBreakout size="lg" />
    </section>
  );
}
