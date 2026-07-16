"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "@/components/ui/app-link";
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
// Equipment List — main grid with URL-persisted filters + add kit
// ============================================================

interface EquipmentListProps {
  initialKits: KitListItem[];
  userRole: "admin" | "ops";
  basePath: string;
  hideHeader?: boolean;
}

type LocationFilter = EquipmentLocationType | "all";
type ConditionFilter = EquipmentCondition | "all" | "damaged";

export function EquipmentList({
  initialKits,
  userRole,
  basePath,
  hideHeader = false,
}: EquipmentListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [kits, setKits] = useState(initialKits);
  const [addOpen, setAddOpen] = useState(false);

  // URL-persisted state — chip row reflects ?search=&condition=&location=
  const search = searchParams.get("search") ?? "";
  const locationFilter = (searchParams.get("location") as LocationFilter) || "all";
  const conditionFilter =
    (searchParams.get("condition") as ConditionFilter) || "all";
  const stockFilter = searchParams.get("stock"); // "low" — surfaced from pulse
  const checkinFilter = searchParams.get("checkin"); // "overdue"
  const assignedFilter = searchParams.get("assigned"); // "no"

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  const filtered = useMemo(() => {
    return kits.filter((kit) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = kit.name.toLowerCase().includes(q);
        const matchesCoach = (kit.assigned_coach_name ?? "")
          .toLowerCase()
          .includes(q);
        const matchesCentre = (kit.assigned_centre_name ?? "")
          .toLowerCase()
          .includes(q);
        if (!matchesName && !matchesCoach && !matchesCentre) return false;
      }
      if (locationFilter !== "all" && kit.location_type !== locationFilter)
        return false;
      if (
        conditionFilter !== "all" &&
        conditionFilter !== "damaged" &&
        kit.condition !== conditionFilter
      )
        return false;
      if (
        conditionFilter === ("damaged" as ConditionFilter) &&
        kit.condition !== "needs_attention" &&
        kit.condition !== "needs_replacement"
      )
        return false;
      return true;
    });
  }, [kits, search, locationFilter, conditionFilter]);

  async function refreshKits() {
    const { data } = await getKits();
    if (data) setKits(data);
    router.refresh();
  }

  const activeChipCount =
    (search ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    (conditionFilter !== "all" ? 1 : 0) +
    (stockFilter ? 1 : 0) +
    (checkinFilter ? 1 : 0) +
    (assignedFilter ? 1 : 0);

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
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Kit
          </Button>
        </div>
      )}

      {/* Filter chip row */}
      <div
        className={`${hideHeader ? "" : "mt-4"} flex flex-col gap-3 sm:flex-row sm:items-center`}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => updateParam("search", e.target.value)}
            placeholder="Search kits, coaches, centres..."
            className="rounded-2xl pl-9"
          />
        </div>
        {hideHeader && (
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Kit
          </Button>
        )}
        <Select
          value={locationFilter}
          onValueChange={(v) => updateParam("location", v)}
        >
          <SelectTrigger className="w-[160px] rounded-2xl">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            <SelectItem value="storage">Storage</SelectItem>
            <SelectItem value="coach">With coach</SelectItem>
            <SelectItem value="centre">At centre</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={conditionFilter}
          onValueChange={(v) => updateParam("condition", v)}
        >
          <SelectTrigger className="w-[180px] rounded-2xl">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All conditions</SelectItem>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="needs_attention">Needs attention</SelectItem>
            <SelectItem value="needs_replacement">Needs replacement</SelectItem>
            <SelectItem value="damaged">Damaged or missing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active filter chips (from pulse jump-links) */}
      {activeChipCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {stockFilter === "low" && (
            <FilterChip
              label="Low stock"
              onClear={() => updateParam("stock", null)}
            />
          )}
          {checkinFilter === "overdue" && (
            <FilterChip
              label="Overdue check-in"
              onClear={() => updateParam("checkin", null)}
            />
          )}
          {assignedFilter === "no" && (
            <FilterChip
              label="Unassigned"
              onClear={() => updateParam("assigned", null)}
            />
          )}
          {activeChipCount > 0 && (
            <button
              type="button"
              onClick={() => {
                router.replace(pathname, { scroll: false });
              }}
              className="text-xs text-muted-foreground/80 hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((kit) => (
            <Link
              key={kit.id}
              href={`${basePath}/${kit.id}`}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
            >
              <EquipmentCard kit={kit} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border bg-muted/20 px-6 py-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-3 text-sm font-medium text-foreground">
            {kits.length === 0
              ? "No equipment kits yet"
              : "No kits match filters"}
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

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="text-muted-foreground/60 hover:text-foreground"
        aria-label={`Clear ${label} filter`}
      >
        ×
      </button>
    </span>
  );
}
