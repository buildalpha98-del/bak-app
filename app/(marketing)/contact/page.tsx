import type { Metadata } from "next";
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { HeroLite } from "@/components/marketing/hero-lite";
import { StickerButton } from "@/components/marketing/sticker-button";
import {
  BALL_COLORS,
  CONTACT_PAGE,
  CONTACT_ROUTES,
  PROGRAM_PAGE,
  SITE,
} from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: `Contact — ${SITE.name}`,
  description: CONTACT_PAGE.description,
};

/**
 * /contact — fully static. Phone, email and service area straight from
 * SITE, then the two funnel doors (parents → clinics, schools and
 * centres → enquiry).
 *
 * The general-contact FORM is deliberately absent: it is Task 4.2's
 * <EnquiryForm /> in "contact" mode, which does not exist yet. Until
 * then this page ships as links only — see the insertion point below.
 *
 * SITE.phone is still the TODO-CONFIRM placeholder and renders as-is,
 * exactly as the footer does. Do not substitute a real-looking number;
 * the placeholder is what flags it for replacement before launch.
 */
export default function ContactPage() {
  return (
    <>
      <HeroLite
        label={CONTACT_PAGE.title}
        eyebrow={CONTACT_PAGE.eyebrow}
        title={CONTACT_PAGE.title}
        intro={CONTACT_PAGE.intro}
      >
        <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
          <StickerButton href="/holiday-clinics">
            {PROGRAM_PAGE.clinicsCta}
            <ArrowRight className="size-5" aria-hidden="true" />
          </StickerButton>
          <StickerButton href={SITE.enquiryUrl} fill="white">
            {PROGRAM_PAGE.quoteCta}
          </StickerButton>
        </div>
      </HeroLite>

      <ContactDetails />

      <ContactRoutes />

      {/* INSERTION POINT — Chunk 4 (Task 4.2): the slim general-contact
          form, <EnquiryForm mode="contact" />, posting to
          /api/crm/enquiry with type "other". Slots in here, between the
          route cards and the footer. */}
    </>
  );
}

/**
 * The three detail cards. Phone and email are real links; the service
 * area is not, so it is a plain card rather than a dead anchor.
 *
 * Contrast (AA): black-on-white body, palette accents carrying their
 * verified `fg`; the hover state on links is #993C1D, the AA-safe
 * orange for small text on white.
 */
function ContactDetails() {
  const CARDS = [
    {
      label: CONTACT_PAGE.phoneLabel,
      value: SITE.phone,
      href: `tel:${SITE.phone}`,
      icon: Phone,
      ball: BALL_COLORS.green,
      note: null,
    },
    {
      label: CONTACT_PAGE.emailLabel,
      value: SITE.email,
      href: `mailto:${SITE.email}`,
      icon: Mail,
      ball: BALL_COLORS.orange,
      note: null,
    },
    {
      label: CONTACT_PAGE.areaLabel,
      value: SITE.serviceArea,
      href: null,
      icon: MapPin,
      ball: BALL_COLORS.red,
      note: CONTACT_PAGE.areaNote,
    },
  ];

  return (
    <Section aria-label={CONTACT_PAGE.detailsTitle} className="bg-white">
      <SectionHeading
        eyebrow={CONTACT_PAGE.detailsEyebrow}
        title={CONTACT_PAGE.detailsTitle}
      />

      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {CARDS.map((card, i) => {
          const Icon = card.icon;
          return (
            <li
              key={card.label}
              className={
                "flex flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[4px_4px_0_#111]" +
                (i === 1 ? " md:rotate-1" : "")
              }
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#111]"
                style={{ backgroundColor: card.ball.color }}
              >
                <Icon
                  className="size-5"
                  strokeWidth={2.5}
                  style={{ color: card.ball.fg }}
                />
              </span>

              <h3 className="mt-5 font-heading text-sm font-bold uppercase tracking-wider text-[#1A1A1A]/60">
                {card.label}
              </h3>

              {card.href ? (
                <a
                  href={card.href}
                  className="mt-2 inline-flex min-h-11 items-center break-words font-heading text-lg font-extrabold leading-snug text-[#111] underline decoration-[#E8712A] decoration-2 underline-offset-4 transition-colors hover:text-[#993C1D]"
                >
                  {card.value}
                </a>
              ) : (
                <p className="mt-2 font-heading text-lg font-extrabold leading-snug text-[#111]">
                  {card.value}
                </p>
              )}

              {card.note && (
                <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/80">
                  {card.note}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The two funnel doors — parents to clinics, schools and centres to the quote form. */
function ContactRoutes() {
  return (
    <Section aria-label={CONTACT_PAGE.routesTitle} className="bg-[#FFF7F2]">
      <SectionHeading
        eyebrow={CONTACT_PAGE.routesEyebrow}
        title={CONTACT_PAGE.routesTitle}
        intro={CONTACT_PAGE.routesIntro}
      />

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {CONTACT_ROUTES.map((route) => (
          <article
            key={route.title}
            className="flex flex-col rounded-2xl border-2 border-[#111] bg-white p-7 shadow-[5px_5px_0_var(--accent)]"
            style={{ "--accent": route.ball.color } as React.CSSProperties}
          >
            <h3 className="font-heading text-2xl font-extrabold tracking-tight text-[#1A1A1A]">
              {route.title}
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[#1A1A1A]/80">
              {route.body}
            </p>
            <div className="mt-auto pt-7">
              <StickerButton href={route.href}>
                {route.cta}
                <ArrowRight className="size-5" aria-hidden="true" />
              </StickerButton>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
