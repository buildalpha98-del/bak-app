"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getMobileItems, isNavItemActive } from "./nav-config";
import type { UserRole } from "@/lib/types/enums";

interface BottomTabsProps {
  role: UserRole;
}

export function BottomTabs({ role }: BottomTabsProps) {
  const pathname = usePathname();
  const items = getMobileItems(role);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-end border-t border-border bg-card/90 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]">
      {items.map((item) => {
        const active = isNavItemActive(item.href, pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-all duration-200 relative",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            {/* Active indicator line */}
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
            )}
            <Icon className={cn("h-5 w-5 transition-transform duration-200", active && "scale-110")} />
            <span className={cn("text-[10px]", active ? "font-semibold" : "font-medium")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
