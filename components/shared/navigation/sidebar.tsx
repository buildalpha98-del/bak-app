"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppLogo } from "@/components/shared/app-logo";
import { NAV_CONFIG, isNavItemActive } from "./nav-config";
import { useSidebar } from "./sidebar-context";
import type { UserRole } from "@/lib/types/enums";

interface SidebarProps {
  role: UserRole;
}

export function Sidebar({ role }: SidebarProps) {
  const { isCollapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const items = NAV_CONFIG[role];

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col sticky top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-out z-50",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
        <AppLogo className="shrink-0" />
        {!isCollapsed && (
          <span className="text-sm font-semibold text-sidebar-foreground truncate">
            Build Alpha Kids
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {items.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          const Icon = item.icon;

          const linkClasses = cn(
            "group flex items-center gap-3 h-10 rounded-lg px-3 text-sm font-medium transition-all duration-200",
            active
              ? "bg-sidebar-accent text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)] text-sidebar-primary-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={<Link href={item.href} />}
                  className={cn(
                    "flex items-center justify-center h-10 rounded-lg px-0 text-sm transition-all duration-200",
                    active
                      ? "bg-sidebar-accent text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-200", active && "scale-110")} />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={linkClasses}>
              <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-200", active && "scale-110")} />
              <span className="truncate">{item.label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary animate-pulse-warm" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="flex h-11 items-center justify-center border-t border-sidebar-border text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all duration-200"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
