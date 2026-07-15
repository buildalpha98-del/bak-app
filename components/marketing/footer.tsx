import Image from "next/image";
import Link from "next/link";
import { Facebook, Instagram, Mail, Phone } from "lucide-react";
import { BRAND, PROGRAMS, SITE } from "@/lib/marketing/content";

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

          <div>
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Programs
            </h3>
            <ul className="mt-4 space-y-3">
              {PROGRAMS.map((program) => (
                <li key={program.slug}>
                  <Link
                    href={`/programs/${program.slug}`}
                    className="text-sm text-white/60 transition-colors hover:text-[#E8712A]"
                  >
                    {program.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Get in touch
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-white/60">
              <li>
                <a
                  href={`tel:${SITE.phone}`}
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
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-white">
              Parents
            </h3>
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
            <Link href="/contact" className="hover:text-[#E8712A]">
              Privacy policy
            </Link>
            <Link href="/contact" className="hover:text-[#E8712A]">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
