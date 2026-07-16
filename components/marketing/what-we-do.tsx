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
const PILLARS = [
  {
    label: "In childcare centres",
    ball: BALL_COLORS.green,
    body: "Our qualified coaches arrive at your centre with every bit of equipment and run structured, age-appropriate sessions built into the childcare day. Two- to five-year-olds learn to run, jump, throw, kick and catch through games — with zero extra admin for your educators.",
    href: "/programs/childcare",
    cta: "Childcare programs",
  },
  {
    label: "In schools",
    ball: BALL_COLORS.blue,
    body: "Curriculum-aligned multi-sport sessions delivered on your grounds, during sport time or straight after the bell. Coaches bring the gear and the session plan, progress skills week on week, and get every student involved — not just the sporty ones.",
    href: "/programs/primary-school",
    cta: "School programs",
  },
  {
    label: "Holiday clinics",
    ball: BALL_COLORS.yellow,
    body: "Full-throttle multi-sport days in the school holidays that parents book and pay for online in about 60 seconds. Numbers are capped so every kid gets coached, NSW Active Kids vouchers are accepted — and the best days sell out fast.",
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
        intro="Three ways Build Alpha Kids turns up across South-West Sydney — same coaches, same energy, zero hassle."
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
