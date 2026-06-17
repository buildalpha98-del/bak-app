"use client";

// ============================================================
// TrainingTabsShell
// ============================================================
//
// Client wrapper for /admin/training + /ops/training that
// URL-persists the active tab as `?tab=modules|pathways`. The
// page server component still owns the data fetch and renders
// the list views inside; this shell only manages the active tab
// value + URL sync.

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabValue = "modules" | "pathways";

interface TrainingTabsShellProps {
  modulesPanel: React.ReactNode;
  pathwaysPanel: React.ReactNode;
}

export function TrainingTabsShell({
  modulesPanel,
  pathwaysPanel,
}: TrainingTabsShellProps) {
  const router = useRouter();
  const params = useSearchParams();

  const raw = params.get("tab");
  const active: TabValue = raw === "pathways" ? "pathways" : "modules";

  const setActive = useCallback(
    (next: string | number) => {
      const v = (next === "pathways" ? "pathways" : "modules") as TabValue;
      const url = new URLSearchParams(Array.from(params.entries()));
      // Strip per-tab filters so we don't carry e.g. type=video into
      // the pathways view where it's meaningless.
      for (const key of [
        "search",
        "type",
        "status",
        "required",
        "due",
        "new",
      ]) {
        url.delete(key);
      }
      if (v === "modules") {
        url.delete("tab");
      } else {
        url.set("tab", v);
      }
      const qs = url.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  return (
    <Tabs value={active} onValueChange={setActive}>
      <TabsList>
        <TabsTrigger value="modules">Modules</TabsTrigger>
        <TabsTrigger value="pathways">Pathways</TabsTrigger>
      </TabsList>

      <TabsContent value="modules" className="mt-4">
        {modulesPanel}
      </TabsContent>

      <TabsContent value="pathways" className="mt-4">
        {pathwaysPanel}
      </TabsContent>
    </Tabs>
  );
}
