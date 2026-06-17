"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipmentList } from "./equipment-list";
import { InventoryList } from "./inventory-list";
import { EquipmentStatusPulseStrip } from "./equipment-status-pulse";
import type { KitListItem } from "@/lib/equipment/types";
import type { InventoryItem } from "@/lib/equipment/types";
import type { EquipmentStatusPulse } from "@/lib/equipment/status-pulse-actions";

// ============================================================
// Equipment Page — Tabs wrapper for Kits + Inventory + pulse
// ============================================================

interface EquipmentPageTabsProps {
  initialKits: KitListItem[];
  initialInventory: InventoryItem[];
  userRole: "admin" | "ops";
  basePath: string;
  pulse: EquipmentStatusPulse;
  centres: { id: string; name: string }[];
}

export function EquipmentPageTabs({
  initialKits,
  initialInventory,
  userRole,
  basePath,
  pulse,
  centres,
}: EquipmentPageTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "inventory" ? "inventory" : "kits";

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "kits") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Equipment</h1>
        <p className="text-sm text-muted-foreground">
          Track and manage equipment kits and inventory.
        </p>
      </div>

      <div className="mb-6">
        <EquipmentStatusPulseStrip pulse={pulse} basePath={basePath} />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="kits">Kits</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="kits" className="mt-6">
          <EquipmentList
            initialKits={initialKits}
            userRole={userRole}
            basePath={basePath}
            hideHeader
          />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <InventoryList
            initialItems={initialInventory}
            userRole={userRole}
            centres={centres}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
