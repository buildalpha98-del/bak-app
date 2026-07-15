import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BALL_COLORS, type Program } from "@/lib/marketing/content";

/**
 * Sticker cards: white fill, thick black outline, hard shadow. Each
 * card takes a ball colour from the canonical brand palette as its
 * accent — the ages chip fill (with its AA-verified `fg` pairing)
 * and the hover shadow.
 */
const ACCENTS = [
  BALL_COLORS.green,
  BALL_COLORS.blue,
  BALL_COLORS.red,
  BALL_COLORS.yellow,
  BALL_COLORS.orange,
] as const;

export function ProgramCard({
  program,
  index,
}: {
  program: Program;
  index: number;
}) {
  const accent = ACCENTS[index % ACCENTS.length];

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

      <h3 className="mt-5 font-heading text-2xl font-extrabold tracking-tight text-[#111]">
        {program.title}
      </h3>
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
