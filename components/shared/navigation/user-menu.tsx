"use client";

import { signOut } from "@/lib/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";
import { ROLE_LABELS } from "./nav-config";
import type { Profile } from "@/lib/types/database";

interface UserMenuProps {
  profile: Profile;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getProfileRoute(role: string): string {
  if (role === "coach") return "/coach/profile";
  if (role === "admin") return "/admin/settings";
  return "/ops";
}

export function UserMenu({ profile }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-secondary transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="User menu">
        <Avatar>
          {profile.photo_url && <AvatarImage src={profile.photo_url} alt={profile.name} />}
          <AvatarFallback className="bg-gradient-to-br from-primary to-[oklch(0.55_0.2_40)] text-xs font-semibold text-white">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:block text-sm font-medium text-foreground">{profile.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-foreground">{profile.name}</p>
              <span className="inline-flex w-fit rounded-full bg-[var(--brand-orange-light)] px-2.5 py-0.5 text-xs font-semibold text-primary">
                {ROLE_LABELS[profile.role]}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => {
            window.location.href = getProfileRoute(profile.role);
          }}
        >
          <User className="mr-2 h-4 w-4" />
          My Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive"
          onSelect={() => {
            signOut();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
