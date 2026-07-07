"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Users,
  FileText,
  BookOpen,
  MessageSquare,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
  UserCheck,
  Shield,
  Star,
  Layers,
} from "lucide-react";
import { AppLogo } from "@/components/shared/app-logo";
import { NotificationBell } from "@/components/shared/navigation/notification-bell";
import { CentreSwitcher } from "@/components/client/centre-switcher";
import { IosInstallPrompt } from "@/components/shared/ios-install-prompt";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import type {
  ClientUserCentre,
  ClientUserWithCentre,
} from "@/lib/client/actions";

interface ClientShellProps {
  clientUser: ClientUserWithCentre;
  /** Every centre this director can access. Empty array stays plain. */
  centres: ClientUserCentre[];
  /** Unread staff replies — badges the Messages nav item. */
  unreadMessages?: number;
  children: React.ReactNode;
}

function getNavItems(centreId: string) {
  return [
    { label: "Dashboard", href: `/client/${centreId}`, icon: Home, mobileOrder: 1 },
    { label: "Impact", href: `/client/${centreId}/impact`, icon: BarChart3, mobileOrder: 2 },
    { label: "Schedule", href: `/client/${centreId}/schedule`, icon: Calendar },
    { label: "Curriculum", href: `/client/${centreId}/curriculum`, icon: BookOpen, mobileOrder: 3 },
    { label: "Children", href: `/client/${centreId}/children`, icon: Users },
    { label: "Our Coaches", href: `/client/${centreId}/staff`, icon: UserCheck },
    { label: "Resources", href: `/client/${centreId}/resources`, icon: Shield },
    { label: "Feedback", href: `/client/${centreId}/feedback`, icon: Star, mobileOrder: 4 },
    { label: "Reports", href: `/client/${centreId}/reports`, icon: FileText },
    { label: "Programs", href: `/client/${centreId}/programs`, icon: Layers },
    { label: "Messages", href: `/client/${centreId}/messages`, icon: MessageSquare, mobileOrder: 5 },
    { label: "Invoices", href: `/client/${centreId}/invoices`, icon: Receipt },
  ] as const;
}

export function ClientShell({
  clientUser,
  centres,
  unreadMessages = 0,
  children,
}: ClientShellProps) {
  const showMessagesBadge = (label: string) =>
    label === "Messages" && unreadMessages > 0;
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems = getNavItems(clientUser.centre_id);
  const mobileNavItems = [...navItems]
    .filter((item) => "mobileOrder" in item && item.mobileOrder !== undefined)
    .sort((a, b) => (a.mobileOrder ?? 99) - (b.mobileOrder ?? 99));

  function isActive(href: string) {
    if (href === `/client/${clientUser.centre_id}`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Top bar */}
      <header
        // iOS notch / dynamic island: in standalone PWA mode the inset
        // pushes our header below the system status bar instead of
        // letting it draw underneath.
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        className="sticky top-0 z-40 flex min-h-14 items-center border-b bg-white px-4"
      >
        {/* Mobile menu toggle */}
        <button
          type="button"
          className="mr-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Logo */}
        <Link href={`/client/${clientUser.centre_id}`} className="shrink-0">
          <AppLogo size="sm" />
        </Link>

        {/* Centre name or multi-centre switcher */}
        <div className="mx-4 flex flex-1 items-center justify-center">
          {centres.length > 1 ? (
            <CentreSwitcher centres={centres} currentCentreId={clientUser.centre_id} />
          ) : (
            <span className="truncate text-sm font-medium text-gray-700">
              {clientUser.centre_name}
            </span>
          )}
        </div>

        {/* Notification bell + User menu */}
        <div className="flex items-center gap-1">
          <NotificationBell userId={clientUser.user_id} userRole="client" />
          <div className="relative">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-sm font-medium text-cyan-700 hover:bg-cyan-200 transition-colors"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User menu"
          >
            {clientUser.name.charAt(0).toUpperCase()}
          </button>

          {userMenuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              {/* Dropdown */}
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border bg-white py-1 shadow-lg">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {clientUser.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {clientUser.email}
                  </p>
                </div>
                <Link
                  href={`/client/${clientUser.centre_id}/settings`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:bg-white md:min-h-[calc(100dvh-3.5rem)]">
          <nav className="flex flex-col gap-1 p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-l-2 border-cyan-600 bg-cyan-50 text-cyan-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  {showMessagesBadge(item.label) && (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-600 px-1.5 text-[11px] font-semibold text-white">
                      {unreadMessages}
                    </span>
                  )}
                </Link>
              );
            })}

            <div className="my-2 border-t" />

            <Link
              href={`/client/${clientUser.centre_id}/settings`}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(`/client/${clientUser.centre_id}/settings`)
                  ? "border-l-2 border-cyan-600 bg-cyan-50 text-cyan-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </Link>
          </nav>
        </aside>

        {/* Mobile slide-out menu */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-30 w-64 bg-white pt-14 shadow-lg md:hidden">
              <nav className="flex flex-col gap-1 p-3">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-l-2 border-cyan-600 bg-cyan-50 text-cyan-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}

                <div className="my-2 border-t" />

                <Link
                  href={`/client/${clientUser.centre_id}/settings`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(`/client/${clientUser.centre_id}/settings`)
                      ? "border-l-2 border-cyan-600 bg-cyan-50 text-cyan-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </Link>
              </nav>
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <IosInstallPrompt />

      {/* Mobile bottom tabs */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] transition-colors min-w-[3rem]",
                active ? "text-cyan-600" : "text-gray-400"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {showMessagesBadge(item.label) && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-cyan-600 ring-2 ring-white" />
                )}
              </span>
              <span className="max-w-[4.5rem] truncate whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
