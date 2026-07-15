import { Section, SectionHeading } from "@/components/marketing/section";

export interface ImpactStat {
  label: string;
  value: string;
}

/**
 * "Our impact" — near-black band with sticker stat cards. Task 2.3
 * feeds live values from public_stats_cache through the same
 * `stats` prop (data swaps in, markup stays). Until then the
 * homepage passes placeholder values.
 *
 * Contrast: black-on-yellow cards are 13.1:1; white heading on
 * #1A1A1A is 17.4:1.
 */
export function ImpactBand({ stats }: { stats: ImpactStat[] }) {
  return (
    <Section aria-label="Our impact" className="bg-[#1A1A1A]">
      <SectionHeading eyebrow="By the numbers" title="Our impact" dark />

      <dl className="mt-12 grid gap-8 sm:grid-cols-3">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={
              // dt precedes dd in source (HTML content model);
              // flex-col-reverse keeps the value on top visually.
              "flex flex-col-reverse rounded-2xl border-2 border-[#111] bg-[#FFD23F] p-7 text-center shadow-[5px_5px_0_#E8712A]" +
              (i === 1 ? " -rotate-1" : "")
            }
          >
            <dt className="mt-2 font-heading text-sm font-bold uppercase tracking-wider text-[#111]">
              {stat.label}
            </dt>
            <dd className="font-heading text-5xl font-extrabold tracking-tight text-[#111]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
