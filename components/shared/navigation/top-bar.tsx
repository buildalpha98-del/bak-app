"use client";

/* eslint-disable @next/next/no-img-element */
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import type { Profile } from "@/lib/types/database";

interface TopBarProps {
  profile: Profile;
}

export function TopBar({ profile }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/80 backdrop-blur-md px-4 sm:px-6">
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

      {/* Right: notifications + user menu */}
      <div className="flex items-center gap-1.5">
        <NotificationBell userId={profile.id} userRole={profile.role} />
        <UserMenu profile={profile} />
      </div>
    </header>
  );
}
