import { ArrowRight } from "lucide-react";
import { StickerButton } from "@/components/marketing/sticker-button";

/**
 * The near-black CTA band — a hard break in the page rhythm aimed at
 * centre directors and school sport coordinators, not parents. Yellow
 * sticker eyebrow on dark, heading, supporting line, one sticker CTA.
 *
 * The single owner of this treatment: the homepage/programs-index B2B
 * band (<B2bBand />) and the repeated "Request a quote" bands on each
 * program page are both thin wrappers around it.
 *
 * Contrast (AA): black-on-yellow 13.1:1; white heading on #1A1A1A
 * 17.4:1; the body sits at white/70 on the same near-black.
 *
 * `label` is optional on purpose — a band that renders more than once
 * on a page must NOT be labelled, or the a11y tree gets two
 * identically-named landmarks. Its <h2> names it either way.
 */
export function CtaBand({
  label,
  eyebrow,
  title,
  body,
  href,
  cta,
}: {
  label?: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <section aria-label={label} className="bg-[#1A1A1A]">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <p className="inline-block -rotate-1 rounded-full border-2 border-[#111] bg-[#FFD23F] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[2px_2px_0_#E8712A]">
            {eyebrow}
          </p>
          <h2 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            {body}
          </p>
        </div>

        <StickerButton href={href} shadow="orange" className="shrink-0">
          {cta}
          <ArrowRight className="size-5" aria-hidden="true" />
        </StickerButton>
      </div>
    </section>
  );
}
