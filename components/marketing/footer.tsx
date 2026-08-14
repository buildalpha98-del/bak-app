import { FOOTER_SPORT_LINKS } from "@/lib/marketing/deep-content";
import Image from "next/image";
import Link from "next/link";
import { Facebook, Instagram, Mail, Phone } from "lucide-react";
import { BRAND, PROGRAMS, SITE, phoneHref } from "@/lib/marketing/content";

const SOCIAL_ICONS = {
  instagram: Instagram,
  facebook: Facebook,
} as const;

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const socials = (
    Object.entries(SITE.socials) as [keyof typeof SOCIAL_ICONS, string][]
  ).filter(([, url]) => !url.startsWith("TODO-CONFIRM"));

  return (
    <footer className="bg-[#1A1A1A] text-white/80">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            {/* Light sticker tile keeps the black-outlined crest crisp on the dark band. */}
            <Link
              href="/"
              className="inline-block rounded-2xl border-2 border-[#111] bg-[#FFF7F2] p-3 shadow-[4px_4px_0_#E8712A]"
            >
              <Image
                src={BRAND.logo}
                alt="Build Alpha Kids"
                width={109}
                height={72}
                className="h-[72px] w-auto"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-white/60">
              {SITE.tagline}
            </p>
            {socials.length > 0 && (
              <div className="mt-5 flex items-center gap-3">
                {socials.map(([key, url]) => {
                  const Icon = SOCIAL_ICONS[key];
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Build Alpha Kids on ${key}`}
                      className="flex size-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-[#E8712A] hover:text-[#E8712A]"
                    >
                      <Icon className="size-5" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/*
            These three column headings are h2, not h3, and must stay h2.
            They are the top-level groupings inside the footer landmark, and
            the footer renders under pages whose main content has no h2 at
            all (/holiday-clinics is one). As h3 they skipped a level
            straight from the page h1 — a WCAG heading-order failure that
            only some pages showed, which is exactly what made it easy to
            miss. Size comes from text-sm, not the tag, so the level is free
            to be correct.
          */}
          <div>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Programs
            </h2>
            <ul className="mt-4 space-y-3">
              {PROGRAMS.map((program) => (
                <li key={program.slug}>
                  <Link
                    href={
                      program.slug === "childcare"
                        ? "/childcare"
                        : `/programs/${program.slug}`
                    }
                    className="text-sm text-white/60 transition-colors hover:text-[#E8712A]"
                  >
                    {program.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Sports for schools
            </h2>
            <ul className="mt-4 space-y-3">
              {FOOTER_SPORT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-[#E8712A]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Get in touch
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-white/60">
              <li>
                <a
                  href={phoneHref()}
                  className="inline-flex items-center gap-2 transition-colors hover:text-[#E8712A]"
                >
                  <Phone className="size-4 shrink-0" />
                  {SITE.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${SITE.email}`}
                  className="inline-flex items-center gap-2 transition-colors hover:text-[#E8712A]"
                >
                  <Mail className="size-4 shrink-0" />
                  {SITE.email}
                </a>
              </li>
              <li>{SITE.serviceArea}</li>
            </ul>
          </div>

          <div>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Parents
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/parent-login"
                  className="text-sm text-white/60 transition-colors hover:text-[#E8712A]"
                >
                  Parent login
                </Link>
              </li>
              <li>
                <Link
                  href="/holiday-clinics"
                  className="text-sm text-white/60 transition-colors hover:text-[#E8712A]"
                >
                  Book a clinic
                </Link>
              </li>
              <li>
                <Link
                  href="/holiday-clinics"
                  className="text-sm text-white/60 transition-colors hover:text-[#E8712A]"
                >
                  Holiday clinics
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} {SITE.name}. ABN {SITE.abn}.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {/* Labels match the page <h1>/<title> exactly — a link that
                says "Terms of service" landing on "Terms of Use" reads as
                the wrong page. */}
            <Link href="/privacy" className="hover:text-[#E8712A]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[#E8712A]">
              Terms of Use
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
