"use client";

import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getMobileItems, isNavItemActive } from "./nav-config";
import type { UserRole } from "@/lib/types/enums";

interface BottomTabsProps {
  role: UserRole;
  /** Hides items flagged `financial: true` when false. */
  financialAccess?: boolean;
}

export function BottomTabs({ role, financialAccess = true }: BottomTabsProps) {
  const pathname = usePathname();
  const items = getMobileItems(role, financialAccess);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-end">
        {items.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          const Icon = item.icon;

          return (
            <Link
              prefetch={false}
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-all duration-200 relative",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {/* Active indicator — bold top stripe with glow */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-10 rounded-b-full bg-primary shadow-[0_2px_8px_rgba(232,113,42,0.3)]" />
              )}
              <div className={cn(
                "flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200",
                active && "bg-primary/10"
              )}>
                <Icon className={cn("h-[18px] w-[18px] transition-transform duration-200", active && "scale-110")} />
              </div>
              <span className={cn("text-[10px] leading-tight", active ? "font-bold" : "font-medium")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
