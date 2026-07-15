import { Section, SectionHeading } from "@/components/marketing/section";

/**
 * The parent journey in four steps. Static copy — approved in the
 * homepage design; step numbers get the skewed orange treatment.
 */
const STEPS = [
  {
    title: "Sign in with just your email",
    body: "Magic link straight to your inbox — no passwords to invent, remember or reset.",
  },
  {
    title: "Book and pay online in 60 seconds",
    body: "Secure payment through Square, with NSW Active Kids vouchers accepted.",
  },
  {
    title: "They play, learn and grow",
    body: "Qualified coaches run every session — real skills, big smiles, zero screens.",
  },
  {
    title: "Track their progress all term",
    body: "Watch skills stack up in your parent account, session after session.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section aria-label="How it works" className="bg-[#FFF7F2]">
      <SectionHeading
        eyebrow="How it works"
        title="From signup to skill tracking in four easy steps"
      />

      <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <span
              aria-hidden="true"
              className="flex size-14 -skew-x-6 items-center justify-center bg-[#E8712A] font-heading text-2xl font-extrabold text-[#1A1A1A]"
            >
              <span className="inline-block skew-x-6">{i + 1}</span>
            </span>
            <h3 className="mt-5 font-heading text-lg font-bold leading-snug text-[#1A1A1A]">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#1A1A1A]/70">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
