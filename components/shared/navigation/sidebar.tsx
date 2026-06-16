"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_CONFIG, filterNavByAccess, isNavItemActive } from "./nav-config";
import { useSidebar } from "./sidebar-context";
import type { UserRole } from "@/lib/types/enums";

interface SidebarProps {
  role: UserRole;
  /** Hides items flagged `financial: true` when false. */
  financialAccess?: boolean;
}

export function Sidebar({ role, financialAccess = true }: SidebarProps) {
  const { isCollapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const items = filterNavByAccess(NAV_CONFIG[role], financialAccess);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col sticky top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-out z-50 relative",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* Subtle diagonal sport stripes on sidebar */}
      <div className="absolute inset-0 sport-stripe-dark pointer-events-none" />

      {/* Logo area — brand-forward */}
      <div className="relative flex h-16 items-center gap-3 border-b border-sidebar-border px-3">
        <div className="relative shrink-0">
          <img
            src="/logo-full.png"
            alt="Build Alpha Kids"
            className="h-9 w-9 object-contain drop-shadow-md"
          />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-display text-[15px] font-bold text-sidebar-foreground tracking-tight truncate leading-tight">
              BAK
            </span>
            <span className="text-[10px] text-sidebar-foreground/40 uppercase tracking-[0.15em] leading-tight">
              Sports Platform
            </span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="relative flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {items.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          const Icon = item.icon;

          const linkClasses = cn(
            "group flex items-center gap-3 h-10 rounded-lg px-3 text-sm font-medium transition-all duration-200 relative",
            active
              ? "bg-sidebar-accent text-sidebar-primary-foreground"
              : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={<Link href={item.href} />}
                  className={cn(
                    "flex items-center justify-center h-10 rounded-lg px-0 text-sm transition-all duration-200 relative",
                    active
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                  )}
                >
                  {/* Active left stripe */}
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sidebar-primary" />
                  )}
                  <Icon className={cn("h-5 w-5 shrink-0 transition-all duration-200", active && "scale-110 text-sidebar-primary")} />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={linkClasses}>
              {/* Active left stripe */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sidebar-primary" />
              )}
              <Icon className={cn("h-5 w-5 shrink-0 transition-all duration-200", active && "scale-110 text-sidebar-primary")} />
              <span className="truncate">{item.label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary animate-pulse-warm" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Role badge + collapse toggle */}
      <div className="relative border-t border-sidebar-border">
        {!isCollapsed && (
          <div className="px-3 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-sidebar-primary/10 px-2 py-1 text-[10px] font-semibold text-sidebar-primary uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary animate-pulse" />
              {role === "admin" ? "Admin" : role === "ops" ? "Operations" : "Coach"} Portal
            </span>
          </div>
        )}
        <button
          onClick={toggle}
          className="flex w-full h-10 items-center justify-center text-sidebar-foreground/35 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all duration-200"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
