import { cn } from "@/lib/utils";

/**
 * Section primitives shared by every homepage/marketing section.
 * Deliberately tiny: a padded full-width band with a centred
 * max-width column, and a heading block with an optional eyebrow.
 * The eyebrow is a yellow sticker (thick black outline + hard
 * shadow, tiny rotation) — the section-level brand marker.
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
  dark = false,
  className,
}: {
  /** Small uppercase sticker label above the title. */
  eyebrow?: string;
  title: string;
  /** One or two supporting sentences under the title. */
  intro?: string;
  /** Set on near-black bands — flips title/intro to white. */
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && (
        <p className="inline-block -rotate-1 rounded-full border-2 border-[#111] bg-[#FFD23F] px-3.5 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[#111] shadow-[2px_2px_0_#111]">
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          "mt-5 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl",
          dark ? "text-white" : "text-[#1A1A1A]"
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cn(
            "mt-4 text-base leading-relaxed sm:text-lg",
            dark ? "text-white/70" : "text-[#1A1A1A]/70"
          )}
        >
          {intro}
        </p>
      )}
    </div>
  );
}
