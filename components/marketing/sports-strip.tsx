import { Section, SectionHeading } from "@/components/marketing/section";
import { SPORTS } from "@/lib/marketing/content";

/**
 * "One club. Six sports." — sits directly under the hero and names
 * every sport we coach as sticker chips, each carrying its ball
 * colour as an outlined dot (decorative; the text is always
 * black-on-white, 18.9:1). One chip gets a tiny rotation for the
 * sticker-sheet feel — deliberately just one.
 */
export function SportsStrip() {
  return (
    <Section aria-label="Sports we coach" className="bg-white">
      <SectionHeading
        eyebrow="The sports"
        title="One club. Six sports."
        intro="Every program mixes them all — so kids find the sports they love instead of specialising before they can tie their laces."
      />

      <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-6">
        {SPORTS.map((sport, i) => (
          <li
            key={sport.name}
            className={
              i === 2
                ? "-rotate-2"
                : undefined
            }
          >
            <span className="inline-flex min-h-11 items-center gap-2.5 rounded-full border-2 border-[#111] bg-white px-5 py-2 font-heading text-base font-bold text-[#111] shadow-[3px_3px_0_#111] sm:text-lg">
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-full border-2 border-[#111]"
                style={{ backgroundColor: sport.ball.color }}
              />
              {sport.name}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
