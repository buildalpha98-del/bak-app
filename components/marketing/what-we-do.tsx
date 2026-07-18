import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { BALL_COLORS } from "@/lib/marketing/content";

/**
 * The three ways Build Alpha Kids actually operates — concrete copy
 * (who turns up, what a session looks like, how you book) so the
 * homepage answers "what do you actually do?" before the program
 * grid. Sticker cards; each pillar keyed to a ball colour from the
 * canonical palette, used as a label fill with its AA-verified
 * foreground pairing.
 */
/**
 * Order is deliberate (owner-directed 2026-07-18): schools and
 * childcare are the primary audiences and lead; the parent-facing
 * clinics ride third. Engagement models in the copy are owner-supplied
 * the same day — schools pay us directly; childcare is centre flat fee
 * OR family session packages; clinics are parent-paid.
 */
const PILLARS = [
  {
    label: "For schools",
    ball: BALL_COLORS.blue,
    body: "Curriculum-friendly multi-sport programs on your grounds — primary, high school and after-school. Your school engages us directly: we design around your bell times, our coaches bring every bit of equipment, and you get one provider and one invoice.",
    href: "/schools",
    cta: "School programs",
  },
  {
    label: "For childcare & ELCs",
    ball: BALL_COLORS.green,
    body: "EYLF-aligned sessions built into the childcare day for ages two to five. Your centre books us on a flat fee — or families opt in on a simple session-package rate. Either way our coaches run it end to end, with zero extra admin for your educators.",
    href: "/programs/childcare",
    cta: "Childcare programs",
  },
  {
    label: "For parents",
    ball: BALL_COLORS.yellow,
    body: "After-school clinics through term and full-throttle multi-sport days in the holidays. Book and pay online in about 60 seconds, NSW Active Kids vouchers accepted — numbers are capped and the best days sell out fast.",
    href: "/holiday-clinics",
    cta: "See clinic dates",
  },
] as const;

export function WhatWeDo() {
  return (
    <Section aria-label="What we do" className="bg-[#FFF7F2]">
      <SectionHeading
        eyebrow="What we do"
        title="Real coaching, wherever kids already are"
        intro="Schools, childcare centres and holiday clinics across South-West Sydney — same coaches, same energy, zero hassle."
      />

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {PILLARS.map((pillar, i) => (
          <article
            key={pillar.label}
            className="flex flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]"
          >
            <span
              className={
                "inline-block max-w-max rounded-full border-2 border-[#111] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-wider" +
                (i === 1 ? " rotate-1" : "")
              }
              style={{
                backgroundColor: pillar.ball.color,
                color: pillar.ball.fg,
              }}
            >
              {pillar.label}
            </span>
            <p className="mt-5 text-sm leading-relaxed text-[#1A1A1A]/80">
              {pillar.body}
            </p>
            <Link
              href={pillar.href}
              className="mt-auto inline-flex min-h-11 items-center gap-2 pt-6 font-heading text-sm font-bold text-[#111] hover:text-[#993C1D]"
            >
              {pillar.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </Section>
  );
}
