import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/marketing/content";

/**
 * Orange ramp across the grid — cards run light cream → deep rust in
 * PROGRAMS order. Foregrounds are paired per step to hold AA contrast:
 * near-black everywhere except the deepest card, which flips to white
 * (white on #993C1D ≈ 6.9:1).
 */
const RAMP = [
  { bg: "#FFF7F2", fg: "#1A1A1A", sub: "#993C1D", chip: "#E8712A" },
  { bg: "#FBDCC5", fg: "#1A1A1A", sub: "#993C1D", chip: "#E8712A" },
  { bg: "#F5A567", fg: "#1A1A1A", sub: "#7A2E12", chip: "#FFF7F2" },
  { bg: "#E8712A", fg: "#1A1A1A", sub: "#3D1708", chip: "#FFF7F2" },
  { bg: "#993C1D", fg: "#FFFFFF", sub: "#FBDCC5", chip: "#E8712A" },
] as const;

export function ProgramCard({
  program,
  index,
}: {
  program: Program;
  index: number;
}) {
  const tone = RAMP[index % RAMP.length];
  const deepCard = tone.bg === "#993C1D";

  return (
    <Link
      href={`/programs/${program.slug}`}
      className="group flex h-full flex-col rounded-3xl p-7 transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10 sm:p-8"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {/* Skewed ages chip — the row's shared accent */}
      <span
        className="inline-block max-w-max -skew-x-3 px-2.5 py-1 font-heading text-[11px] font-bold uppercase tracking-wider"
        style={{
          backgroundColor: tone.chip,
          color: "#1A1A1A",
        }}
      >
        <span className="inline-block skew-x-3">{program.ages}</span>
      </span>

      <h3 className="mt-5 font-heading text-2xl font-extrabold tracking-tight">
        {program.title}
      </h3>
      <p
        className="mt-2 text-sm font-semibold leading-snug"
        style={{ color: tone.sub }}
      >
        {program.tagline}
      </p>

      <span
        className={cn(
          "mt-auto inline-flex min-h-11 items-center gap-2 pt-6 font-heading text-sm font-bold",
          deepCard ? "text-white" : "text-[#1A1A1A]"
        )}
      >
        Explore program
        <ArrowRight
          className="size-4 transition-transform duration-200 group-hover:translate-x-1"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
