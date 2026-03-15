"use client";

import { signOut } from "@/lib/auth/actions";
import { useTransition } from "react";
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
import { LogOut, Loader2, User } from "lucide-react";
import { ROLE_LABELS } from "./nav-config";
import type { Profile } from "@/lib/types/database";
import { ThemeToggle } from "@/components/shared/theme-toggle";

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

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-gradient-to-br from-[#E8712A] to-[#D84315]",
  ops: "bg-gradient-to-br from-[#2962FF] to-[#1565C0]",
  coach: "bg-gradient-to-br from-[#4CAF50] to-[#2E7D32]",
};

export function UserMenu({ profile }: UserMenuProps) {
  const [signingOut, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-secondary transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="User menu">
        <Avatar>
          {profile.photo_url && <AvatarImage src={profile.photo_url} alt={profile.name} />}
          <AvatarFallback className={`${ROLE_COLORS[profile.role] ?? ROLE_COLORS.admin} text-xs font-bold text-white`}>
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:block text-sm font-medium text-foreground">{profile.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-bold text-foreground">{profile.name}</p>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[var(--brand-orange-light)] px-2.5 py-0.5 text-xs font-bold text-primary uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
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
        <div className="px-1">
          <ThemeToggle />
        </div>
        <div className="h-px bg-border my-1" />
        <DropdownMenuItem
          className="cursor-pointer text-destructive"
          disabled={signingOut}
          onSelect={(e) => {
            e.preventDefault();
            startTransition(() => {
              signOut();
            });
          }}
        >
          {signingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
