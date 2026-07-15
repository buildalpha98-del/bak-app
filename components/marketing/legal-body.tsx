import { Section } from "@/components/marketing/section";
import {
  LEGAL_DRAFT_NOTICE,
  LEGAL_LAST_UPDATED,
  type LegalPage,
} from "@/lib/marketing/legal";

/**
 * The shared renderer for /privacy and /terms.
 *
 * Deliberately sober. It uses the site's primitives (HeroLite on the
 * page, Section here) so a parent doesn't feel they've been bounced to
 * a different website mid-journey — but none of the brand's louder
 * furniture: no rotated stickers, no yellow CTA, no ball breakouts
 * between clauses. A policy that swaggers reads as a policy that is
 * selling you something.
 *
 * Sections are numbered and mirrored in a contents list, because these
 * pages are scanned for one clause, not read top to bottom.
 *
 * Contrast (AA): near-black #1A1A1A body on white; the muted body copy
 * is #1A1A1A at 80% (≥7:1 on white). The draft notice is near-black on
 * the cream #FFF7F2 band.
 */
export function LegalBody({ page }: { page: LegalPage }) {
  return (
    <Section aria-label={page.title} className="bg-white">
      <div className="max-w-3xl">
        {/* Draft notice — stays until a lawyer signs these pages off. */}
        <div className="rounded-2xl border-2 border-[#111] bg-[#FFF7F2] p-6">
          <p className="font-heading text-sm font-bold uppercase tracking-widest text-[#111]">
            Draft for review
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80">
            {LEGAL_DRAFT_NOTICE}
          </p>
        </div>

        <p className="mt-8 text-sm font-medium text-[#1A1A1A]/60">
          Last updated: {LEGAL_LAST_UPDATED}
        </p>

        {/* Contents — anchor links into the numbered sections. */}
        <nav aria-label={`${page.title} contents`} className="mt-8">
          <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-[#111]">
            Contents
          </h2>
          <ol className="mt-4 space-y-2">
            {page.sections.map((section, i) => (
              <li key={section.heading} className="text-sm">
                <a
                  href={`#${sectionId(section.heading)}`}
                  className="text-[#1A1A1A]/70 underline decoration-[#E8712A] decoration-2 underline-offset-4 transition-colors hover:text-[#E8712A]"
                >
                  {i + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          {page.sections.map((section, i) => (
            <section
              key={section.heading}
              id={sectionId(section.heading)}
              aria-labelledby={`${sectionId(section.heading)}-heading`}
              // Clears the sticky nav when jumped to from the contents list.
              className="scroll-mt-24"
            >
              <h2
                id={`${sectionId(section.heading)}-heading`}
                className="font-heading text-xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-2xl"
              >
                {i + 1}. {section.heading}
              </h2>

              <div className="mt-4 space-y-4">
                {section.body.map((paragraph, j) => (
                  <p
                    key={j}
                    className="text-base leading-relaxed text-[#1A1A1A]/80"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              {section.bullets && (
                <ul className="mt-4 space-y-3">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-[#E8712A]"
                      />
                      <span className="text-base leading-relaxed text-[#1A1A1A]/80">
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Heading → stable anchor id ("Who we share it with" → "who-we-share-it-with"). */
function sectionId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
