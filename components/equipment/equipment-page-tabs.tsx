"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipmentList } from "./equipment-list";
import { InventoryList } from "./inventory-list";
import type { KitListItem } from "@/lib/equipment/types";
import type { InventoryItem } from "@/lib/equipment/types";

// ============================================================
// Equipment Page — Tabs wrapper for Kits + Inventory
// ============================================================

interface EquipmentPageTabsProps {
  initialKits: KitListItem[];
  initialInventory: InventoryItem[];
  userRole: "admin" | "ops";
  basePath: string;
}

export function EquipmentPageTabs({
  initialKits,
  initialInventory,
  userRole,
  basePath,
}: EquipmentPageTabsProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Equipment</h1>
        <p className="text-sm text-muted-foreground">
          Track and manage equipment kits and inventory.
        </p>
      </div>

      <Tabs defaultValue="kits" className="w-full">
        <TabsList>
          <TabsTrigger value="kits">Kits</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="kits" className="mt-4">
          <EquipmentList
            initialKits={initialKits}
            userRole={userRole}
            basePath={basePath}
            hideHeader
          />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <InventoryList initialItems={initialInventory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
