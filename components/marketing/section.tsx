import { cn } from "@/lib/utils";

/**
 * Section primitives shared by every homepage/marketing section.
 * Deliberately tiny: a padded full-width band with a centred
 * max-width column, and a heading block with an optional eyebrow.
 */

export function Section({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("py-16 sm:py-24", className)} {...props}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  className,
}: {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  /** One or two supporting sentences under the title. */
  intro?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && (
        <p className="inline-block -skew-x-3 bg-[#E8712A] px-3 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#1A1A1A]">
          <span className="inline-block skew-x-3">{eyebrow}</span>
        </p>
      )}
      <h2 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {intro && (
        <p className="mt-4 text-base leading-relaxed text-[#1A1A1A]/70 sm:text-lg">
          {intro}
        </p>
      )}
    </div>
  );
}
