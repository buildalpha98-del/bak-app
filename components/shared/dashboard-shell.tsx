"use client";

import type { Profile } from "@/lib/types/database";
import { SidebarProvider } from "./navigation/sidebar-context";
import { Sidebar } from "./navigation/sidebar";
import { TopBar } from "./navigation/top-bar";
import { BottomTabs } from "./navigation/bottom-tabs";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { InstallPrompt } from "./install-prompt";
import { SessionTimeoutWarning } from "./session-timeout-warning";
import { useEphemeralSession } from "@/lib/hooks/useEphemeralSession";

interface DashboardShellProps {
  profile: Profile;
  children: React.ReactNode;
}

export function DashboardShell({ profile, children }: DashboardShellProps) {
  useEphemeralSession();

  return (
    <SidebarProvider>
      <div className="grain-overlay flex min-h-screen bg-background">
        <Sidebar role={profile.role} />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar profile={profile} />
          <SyncStatusIndicator />
          <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
        <BottomTabs role={profile.role} />
        <InstallPrompt />
        <SessionTimeoutWarning />
      </div>
    </SidebarProvider>
  );
}
