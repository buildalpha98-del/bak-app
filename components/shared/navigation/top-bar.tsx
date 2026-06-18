"use client";

/* eslint-disable @next/next/no-img-element */
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { Search } from "lucide-react";
import type { Profile } from "@/lib/types/database";

interface TopBarProps {
  profile: Profile;
}

export function TopBar({ profile }: TopBarProps) {
  return (
    <header
      // Honour iOS notch / dynamic island in standalone PWA mode: the
      // top inset pushes the header content below the status bar instead
      // of letting it stack underneath when statusBarStyle is
      // black-translucent.
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-border bg-card/80 backdrop-blur-md px-4 sm:px-6"
    >
      {/* Left: logo on mobile, breadcrumbs on desktop */}
      <div className="flex items-center gap-3">
        <div className="flex md:hidden items-center gap-2.5 shrink-0">
          <img
            src="/logo-full.png"
            alt="Build Alpha Kids"
            className="h-8 w-8 object-contain"
          />
          <span className="font-display text-sm font-bold text-foreground tracking-tight">
            BAK
          </span>
        </div>
        <Breadcrumbs />
      </div>

      {/* Centre: search trigger (desktop only). Dispatches the Cmd+K
          shortcut on `window` so the CommandPalette listener picks it up. */}
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true })
          )
        }
        className="hidden md:inline-flex items-center gap-2 h-8 rounded-lg border border-border/60 bg-secondary/30 px-3 text-xs text-muted-foreground hover:border-[#E8712A]/50 hover:bg-secondary/60 hover:text-foreground transition-all"
        aria-label="Open global search"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search centres, coaches, leads…</span>
        <kbd className="ml-2 inline-flex h-5 items-center rounded border border-border/60 bg-background/50 px-1 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      {/* Right: notifications + user menu */}
      <div className="flex items-center gap-1.5">
        <NotificationBell userId={profile.id} userRole={profile.role} />
        <UserMenu profile={profile} />
      </div>
    </header>
  );
}
