"use client";

import { Suspense } from "react";
import type { Profile } from "@/lib/types/database";
import { SidebarProvider } from "./navigation/sidebar-context";
import { Sidebar } from "./navigation/sidebar";
import { TopBar } from "./navigation/top-bar";
import { BottomTabs } from "./navigation/bottom-tabs";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { InstallPrompt } from "./install-prompt";
import { IosInstallPrompt } from "./ios-install-prompt";
import { SessionTimeoutWarning } from "./session-timeout-warning";
import { useEphemeralSession } from "@/lib/hooks/useEphemeralSession";
import { CommandPalette } from "./command-palette";
import { QuickActions } from "./quick-actions";
import { DeniedToast } from "./denied-toast";

interface DashboardShellProps {
  profile: Profile;
  children: React.ReactNode;
}

export function DashboardShell({ profile, children }: DashboardShellProps) {
  useEphemeralSession();

  return (
    <SidebarProvider>
      <div className="grain-overlay flex min-h-screen bg-background">
        <Sidebar role={profile.role} financialAccess={profile.financial_access} />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar profile={profile} />
          <SyncStatusIndicator />
          <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
        <BottomTabs role={profile.role} financialAccess={profile.financial_access} />
        <QuickActions role={profile.role} />
        <CommandPalette userRole={profile.role} />
        <InstallPrompt />
        <IosInstallPrompt />
        <SessionTimeoutWarning />
        {/* useSearchParams must sit behind a Suspense boundary or it
            opts the whole tree out of static rendering. */}
        <Suspense fallback={null}>
          <DeniedToast />
        </Suspense>
      </div>
    </SidebarProvider>
  );
}
