"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/marketing/content";
import { StickerButton } from "@/components/marketing/sticker-button";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Schools and childcare lead (owner-directed 2026-07-18) — they are
 * the primary audiences, so each gets a direct top-level link and the
 * parent-facing clinics ride third. /programs stays reachable from
 * both destination pages and the footer.
 */
const LINKS = [
  { href: "/schools", label: "Schools" },
  { href: "/programs/childcare", label: "Childcare" },
  { href: "/holiday-clinics", label: "Holiday clinics" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

/**
 * Auth state resolves client-side so marketing pages stay fully static:
 * the server always renders the logged-out nav, and we hydrate to
 * "My account" once we know a Supabase session exists.
 */
export function MarketingNav() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data.session);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the mobile sheet on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const accountHref = signedIn ? "/parent" : "/parent-login";
  const accountLabel = signedIn ? "My account" : "Parent login";

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-h-11 shrink-0 items-center">
          <Image
            src={BRAND.logo}
            alt="Build Alpha Kids"
            width={73}
            height={48}
            priority
            className="h-12 w-auto"
          />
        </Link>

        {/* Desktop links */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FFF7F2] hover:text-[#993C1D]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={accountHref}
            className="flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FFF7F2] hover:text-[#993C1D]"
          >
            {accountLabel}
          </Link>
          <StickerButton href="/holiday-clinics" size="sm">
            Book now
          </StickerButton>
        </div>

        {/* Mobile menu */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              // Explicit stable id: base-ui otherwise assigns a
              // React-useId-generated one, whose value depends on the
              // exact tree path above the nav. This button is the only
              // sheet element in the SSR HTML, so pinning its id keeps
              // hydration stable even if the provider tree shifts
              // (observed once in dev via an HMR stale-SSR window).
              id="marketing-nav-menu-trigger"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-11"
              )}
              aria-label="Open menu"
            >
              <Menu className="size-6" />
            </SheetTrigger>
            <SheetContent side="right" className="w-3/4 sm:max-w-sm">
              <SheetHeader>
                <SheetTitle>
                  <Image
                    src={BRAND.logo}
                    alt="Build Alpha Kids"
                    width={61}
                    height={40}
                    className="h-10 w-auto"
                  />
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Primary"
                className="flex flex-col gap-1 px-4"
              >
                {LINKS.map((link) => (
                  <SheetClose
                    key={link.href}
                    // Rendering an <a> (next/link), not a <button> —
                    // without this base-ui logs a nativeButton
                    // console error for every menu item.
                    nativeButton={false}
                    render={
                      <Link
                        href={link.href}
                        className="flex min-h-11 items-center rounded-lg px-3 text-base font-semibold text-[#1A1A1A] hover:bg-[#FFF7F2] hover:text-[#993C1D]"
                      />
                    }
                  >
                    {link.label}
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                <SheetClose
                  nativeButton={false}
                  render={
                    <Link
                      href={accountHref}
                      className="flex min-h-11 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-semibold text-[#1A1A1A] hover:bg-[#FFF7F2]"
                    />
                  }
                >
                  {accountLabel}
                </SheetClose>
                <SheetClose
                  nativeButton={false}
                  render={
                    <StickerButton
                      href="/holiday-clinics"
                      size="sm"
                      className="flex w-full"
                    />
                  }
                >
                  Book now
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
