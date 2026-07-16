import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Program } from "@/lib/marketing/content";

/**
 * Sticker cards: white fill, thick black outline, hard shadow. Each
 * card takes its ball colour from `program.accent` (declared once in
 * content.ts, so the card and the program's own page always agree) —
 * used as the ages chip fill, with the accent's AA-verified `fg`
 * pairing, and as the hover shadow.
 *
 * `headingLevel` exists because this card renders under two different
 * heading contexts and a card cannot know its own depth:
 *
 *  - on `/`, the grid sits under a section h2, so the card title is an
 *    h3 (the default) and the document reads h1 > h2 > h3;
 *  - on `/programs`, the grid IS the page content and sits directly
 *    under the page h1, so the title must be an h2 or the outline jumps
 *    h1 > h3 and fails WCAG heading-order.
 *
 * Hard-coding either level breaks the other page, so the caller — which
 * is the only thing that knows the surrounding structure — states it.
 * The visual size comes from text-2xl, so the level carries no styling.
 */
export function ProgramCard({
  program,
  headingLevel = 3,
}: {
  program: Program;
  headingLevel?: 2 | 3;
}) {
  const accent = program.accent;
  const Heading = `h${headingLevel}` as const;

  return (
    <Link
      href={`/programs/${program.slug}`}
      className="group flex h-full flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_var(--accent)] sm:p-8"
      style={
        {
          "--accent": accent.color,
        } as React.CSSProperties
      }
    >
      {/* Ages chip in the card's ball colour */}
      <span
        className="inline-block max-w-max rounded-full border-2 border-[#111] px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider"
        style={{ backgroundColor: accent.color, color: accent.fg }}
      >
        {program.ages}
      </span>

      <Heading className="mt-5 font-heading text-2xl font-extrabold tracking-tight text-[#111]">
        {program.title}
      </Heading>
      <p className="mt-2 text-sm font-semibold leading-snug text-[#1A1A1A]/70">
        {program.tagline}
      </p>

      <span className="mt-auto inline-flex min-h-11 items-center gap-2 pt-6 font-heading text-sm font-bold text-[#111]">
        Explore program
        <ArrowRight
          className="size-4 transition-transform duration-200 group-hover:translate-x-1"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
