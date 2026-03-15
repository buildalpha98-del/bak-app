"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_CONFIG, isNavItemActive, getMobileItems } from "@/components/shared/navigation/nav-config";
import { AppLogo } from "@/components/shared/app-logo";
import { cn } from "@/lib/utils";

interface ParentShellProps {
  parentName: string;
  children: React.ReactNode;
}

export function ParentShell({ parentName, children }: ParentShellProps) {
  const pathname = usePathname();
  const navItems = NAV_CONFIG.parent;
  const mobileItems = getMobileItems("parent");

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-orange-100 bg-white">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-orange-100">
          <AppLogo size="sm" />
          <span className="text-sm font-medium text-muted-foreground truncate">
            {parentName}
          </span>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-orange-50 text-[#E8712A]"
                    : "text-muted-foreground hover:bg-orange-50/50 hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-orange-100 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <AppLogo size="sm" />
          </div>
          <div className="hidden md:block" />
          <span className="text-sm font-medium text-muted-foreground">
            Hi, {parentName.split(" ")[0]}
          </span>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-orange-100 px-1 pb-[env(safe-area-inset-bottom)] z-50">
        <div className="flex items-center justify-around">
          {mobileItems.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-3 min-w-[56px] transition-colors",
                  active ? "text-[#E8712A]" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
