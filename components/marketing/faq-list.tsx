import { Section, SectionHeading } from "@/components/marketing/section";

export interface Faq {
  q: string;
  a: string;
}

/**
 * FAQ accordion shared by the program pages and the /schools hub.
 * Native <details>/<summary> so the section is server-rendered and
 * keyboard-accessible with zero client JS; the marker is a plus that
 * rotates to a cross via the group-open variant.
 */
export function FaqList({
  eyebrow,
  title,
  faqs,
  className = "bg-white",
}: {
  eyebrow: string;
  title: string;
  faqs: readonly Faq[];
  className?: string;
}) {
  if (!faqs.length) return null;

  return (
    <Section aria-label={title} className={className}>
      <SectionHeading eyebrow={eyebrow} title={title} />

      <div className="mt-12 space-y-4">
        {faqs.map((faq) => (
          <details
            key={faq.q}
            className="group rounded-2xl border-2 border-[#111] bg-[#FFF7F2] shadow-[4px_4px_0_#111] open:bg-white"
          >
            <summary className="cursor-pointer list-none px-6 py-5 font-heading text-base font-bold text-[#111] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-4">
                {faq.q}
                <span
                  aria-hidden="true"
                  className="shrink-0 font-heading text-xl leading-none transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="px-6 pb-6 text-sm leading-relaxed text-[#1A1A1A]/80 sm:text-base">
              {faq.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
