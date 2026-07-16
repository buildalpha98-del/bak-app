import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/marketing/content";

/**
 * The illustrated ball row straddling a band's bottom edge — pinned
 * to the edge and translated half-out, so the balls break across the
 * orange/white boundary. The section below must clear the overhang
 * with its own top padding.
 *
 * `size="lg"` is the homepage hero's taller three-strip variant;
 * every other band uses the default two-strip `sm`.
 */
export function BallRowBreakout({
  size = "sm",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-1/2 justify-center gap-10 px-4",
        className
      )}
    >
      <Image
        src={BRAND.ballsRow}
        alt=""
        width={298}
        height={96}
        unoptimized
        className={
          size === "lg" ? "h-16 w-auto sm:h-20 lg:h-24" : "h-14 w-auto sm:h-16"
        }
      />
      <Image
        src={BRAND.ballsRowAlt}
        alt=""
        width={298}
        height={96}
        unoptimized
        className={
          size === "lg"
            ? "hidden h-20 w-auto md:block lg:h-24"
            : "hidden h-16 w-auto md:block"
        }
      />
      {size === "lg" && (
        <Image
          src={BRAND.ballsRow}
          alt=""
          width={298}
          height={96}
          unoptimized
          className="hidden h-24 w-auto xl:block"
        />
      )}
    </div>
  );
}

/**
 * The shared "hero-lite" band used by every secondary page: full-bleed
 * court orange, decorative court-line arcs, a yellow sticker eyebrow,
 * the H1, an optional intro, and the ball-row breakout at the bottom
 * edge. `children` renders under the intro — chips, CTA rows, anything
 * page-specific.
 *
 * The homepage hero (components/marketing/hero.tsx) deliberately does
 * NOT use this: it is a two-column grid carrying the badge crest, a
 * marker-underlined H1 and its own deeper padding. It shares the
 * BallRowBreakout only.
 *
 * Contrast (AA): the H1 is white on #E8712A, which passes at heading
 * size only; the intro sits in near-black #1A1A1A (5.66:1 on orange).
 */
export function HeroLite({
  eyebrow,
  title,
  intro,
  label,
  children,
}: {
  /** Small uppercase yellow sticker above the title. */
  eyebrow: string;
  title: string;
  /** Supporting sentences under the title, in near-black body copy. */
  intro?: React.ReactNode;
  /** Accessible name for the band's landmark. */
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="relative bg-[#E8712A]">
      {/* Court-line arcs — decorative, clipped inside the band. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-56 size-[480px] rounded-full border-[3px] border-white/15" />
        <div className="absolute -bottom-72 -left-32 size-[520px] rounded-full border-[3px] border-white/15" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
        <p className="inline-block -rotate-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[3px_3px_0_#111]">
          {eyebrow}
        </p>

        <h1 className="mt-6 font-heading text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          {title}
        </h1>

        {intro && (
          <p className="mt-5 max-w-2xl text-lg font-medium leading-relaxed text-[#1A1A1A]">
            {intro}
          </p>
        )}

        {children}
      </div>

      <BallRowBreakout />
    </section>
  );
}
