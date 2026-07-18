import { PARTNERS, PARTNER_STRIP } from "@/lib/marketing/content";

/**
 * Named-partner marquee — the modern take on the old WordPress site's
 * sliding partner banner (owner-requested 2026-07-18). Text-only
 * sticker pills until partner logos and written permission to use
 * them are collected; then this component swaps pills for logos and
 * nothing else changes.
 *
 * Motion: a pure-CSS marquee (keyframes in globals.css) built from the
 * list rendered twice — the second copy is aria-hidden so screen
 * readers hear each partner once. Under prefers-reduced-motion the
 * animation stops and the single visible list wraps statically; no JS
 * either way, so the section stays server-rendered.
 */
export function PartnerStrip() {
  return (
    <section
      aria-label={PARTNER_STRIP.title}
      className="border-y-2 border-[#111] bg-white py-10"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="text-center font-heading text-xs font-bold uppercase tracking-widest text-[#993C1D]">
          {PARTNER_STRIP.eyebrow}
        </p>
        <h2 className="mt-2 text-center font-heading text-xl font-extrabold tracking-tight text-[#111] sm:text-2xl">
          {PARTNER_STRIP.title}
        </h2>
      </div>

      <div className="marquee mt-8" role="list">
        <div className="marquee-track">
          <PartnerPills />
          <PartnerPills ariaHidden />
        </div>
      </div>
    </section>
  );
}

function PartnerPills({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className="marquee-group flex min-w-max items-center gap-4 px-2"
    >
      {PARTNERS.map((name) => (
        <span
          role={ariaHidden ? undefined : "listitem"}
          key={name}
          className="inline-block whitespace-nowrap rounded-full border-2 border-[#111] bg-[#FFF7F2] px-5 py-2.5 font-heading text-sm font-bold text-[#111] shadow-[3px_3px_0_#111]"
        >
          {name}
        </span>
      ))}
    </div>
  );
}
