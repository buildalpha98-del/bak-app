"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Package } from "lucide-react";
import { EquipmentCard } from "./equipment-card";
import { KitFormDialog } from "./kit-form-dialog";
import { getKits } from "@/lib/equipment/actions";
import type { KitListItem } from "@/lib/equipment/types";
import type { EquipmentLocationType, EquipmentCondition } from "@/lib/types/enums";

// ============================================================
// Equipment List — main grid with filters + add kit
// ============================================================

interface EquipmentListProps {
  initialKits: KitListItem[];
  userRole: "admin" | "ops";
  basePath: string;
  hideHeader?: boolean;
}

export function EquipmentList({
  initialKits,
  userRole,
  basePath,
  hideHeader = false,
}: EquipmentListProps) {
  const router = useRouter();
  const [kits, setKits] = useState(initialKits);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<
    EquipmentLocationType | "all"
  >("all");
  const [conditionFilter, setConditionFilter] = useState<
    EquipmentCondition | "all"
  >("all");
  const [addOpen, setAddOpen] = useState(false);

  // Client-side filtering for responsiveness
  const filtered = kits.filter((kit) => {
    if (
      search &&
      !kit.name.toLowerCase().includes(search.toLowerCase()) &&
      !(kit.assigned_coach_name ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      !(kit.assigned_centre_name ?? "")
        .toLowerCase()
        .includes(search.toLowerCase())
    ) {
      return false;
    }
    if (locationFilter !== "all" && kit.location_type !== locationFilter)
      return false;
    if (conditionFilter !== "all" && kit.condition !== conditionFilter)
      return false;
    return true;
  });

  async function refreshKits() {
    const { data } = await getKits();
    if (data) setKits(data);
    router.refresh();
  }

  function handleKitClick(kit: KitListItem) {
    router.push(`${basePath}/${kit.id}`);
  }

  return (
    <div className={hideHeader ? "" : "mx-auto max-w-6xl px-4 py-6"}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Equipment</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage equipment kits across coaches and centres.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Kit
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className={`${hideHeader ? "" : "mt-4"} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search kits, coaches, centres..."
            className="pl-9"
          />
        </div>
        {hideHeader && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Kit
          </Button>
        )}
        <Select
          value={locationFilter}
          onValueChange={(v) =>
            setLocationFilter(v as EquipmentLocationType | "all")
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            <SelectItem value="storage">Storage</SelectItem>
            <SelectItem value="coach">With Coach</SelectItem>
            <SelectItem value="centre">At Centre</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={conditionFilter}
          onValueChange={(v) =>
            setConditionFilter(v as EquipmentCondition | "all")
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="needs_attention">Needs Attention</SelectItem>
            <SelectItem value="needs_replacement">Needs Replacement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((kit) => (
            <EquipmentCard
              key={kit.id}
              kit={kit}
              onClick={handleKitClick}
            />
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-3 text-sm font-medium text-foreground">
            {kits.length === 0 ? "No equipment kits yet" : "No kits match filters"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {kits.length === 0
              ? "Add your first equipment kit to get started."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      )}

      {/* Add Kit Dialog */}
      <KitFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={refreshKits}
      />
    </div>
  );
}
