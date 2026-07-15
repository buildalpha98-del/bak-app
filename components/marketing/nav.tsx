"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

const LINKS = [
  { href: "/programs", label: "Programs" },
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
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center font-heading text-xl font-extrabold tracking-tight sm:text-2xl"
        >
          <span className="text-[#1A1A1A]">Build Alpha</span>{" "}
          <span className="text-[#E8712A]">Kids</span>
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
              className="flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FFF7F2] hover:text-[#E8712A]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={accountHref}
            className="flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FFF7F2] hover:text-[#E8712A]"
          >
            {accountLabel}
          </Link>
          <Link
            href="/holiday-clinics"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-11 rounded-full bg-[#E8712A] px-6 text-sm font-semibold text-white hover:bg-[#E8712A]/90"
            )}
          >
            Book now
          </Link>
        </div>

        {/* Mobile menu */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
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
                <SheetTitle className="font-heading text-lg">
                  <span className="text-[#1A1A1A]">Build Alpha</span>{" "}
                  <span className="text-[#E8712A]">Kids</span>
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Primary"
                className="flex flex-col gap-1 px-4"
              >
                {LINKS.map((link) => (
                  <SheetClose
                    key={link.href}
                    render={
                      <Link
                        href={link.href}
                        className="flex min-h-11 items-center rounded-lg px-3 text-base font-semibold text-[#1A1A1A] hover:bg-[#FFF7F2] hover:text-[#E8712A]"
                      />
                    }
                  >
                    {link.label}
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                <SheetClose
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
                  render={
                    <Link
                      href="/holiday-clinics"
                      className="flex h-11 items-center justify-center rounded-full bg-[#E8712A] px-4 text-sm font-semibold text-white hover:bg-[#E8712A]/90"
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
