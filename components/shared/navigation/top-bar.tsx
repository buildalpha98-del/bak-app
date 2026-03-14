"use client";

import { AppLogo } from "@/components/shared/app-logo";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import type { Profile } from "@/lib/types/database";

interface TopBarProps {
  profile: Profile;
}

export function TopBar({ profile }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6">
      {/* Left: logo on mobile, breadcrumbs on desktop */}
      <div className="flex items-center gap-3">
        <AppLogo className="flex md:hidden shrink-0" />
        <span className="md:hidden text-sm font-semibold text-foreground font-heading">
          Build Alpha Kids
        </span>
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
