"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  MapPin,
  User,
  Building2,
  Warehouse,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import type { KitListItem } from "@/lib/equipment/types";

// ============================================================
// Equipment Kit Card — grid display for kit overview
// ============================================================
//
// The card itself is presentational. Wrap it in a <Link> at the
// call site for navigation + keyboard accessibility. The legacy
// onClick prop is kept optional for any caller that still needs
// it, but Link is the primary path.

interface EquipmentCardProps {
  kit: KitListItem;
  onClick?: (kit: KitListItem) => void;
}

const CONDITION_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive"; icon: React.ReactNode }
> = {
  good: {
    label: "Good",
    variant: "secondary",
    icon: null,
  },
  needs_attention: {
    label: "Needs Attention",
    variant: "default",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  needs_replacement: {
    label: "Replace",
    variant: "destructive",
    icon: <XCircle className="h-3 w-3" />,
  },
};

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  coach: <User className="h-3.5 w-3.5" />,
  centre: <Building2 className="h-3.5 w-3.5" />,
  storage: <Warehouse className="h-3.5 w-3.5" />,
};

function getLocationLabel(kit: KitListItem): string {
  if (kit.location_type === "coach" && kit.assigned_coach_name) {
    return kit.assigned_coach_name;
  }
  if (kit.location_type === "centre" && kit.assigned_centre_name) {
    return kit.assigned_centre_name;
  }
  if (kit.location_type === "storage") return "Storage";
  return kit.location_type;
}

export function EquipmentCard({ kit, onClick }: EquipmentCardProps) {
  const condition = CONDITION_CONFIG[kit.condition] ?? CONDITION_CONFIG.good;
  const itemActive = kit.item_count > 0;

  return (
    <Card
      className={`card-hover rounded-2xl transition hover:-translate-y-0.5 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick ? () => onClick(kit) : undefined}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-5 w-5 shrink-0 text-primary" />
            <h3 className="truncate text-sm font-medium text-foreground">
              {kit.name}
            </h3>
          </div>
          <Badge
            variant={condition.variant}
            className="shrink-0 gap-1 text-[10px]"
          >
            {condition.icon}
            {condition.label}
          </Badge>
        </div>

        {/* Location */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          {LOCATION_ICONS[kit.location_type] ?? <MapPin className="h-3.5 w-3.5" />}
          <span className="truncate">{getLocationLabel(kit)}</span>
        </div>

        {/* Item count */}
        <div
          className={`mt-1.5 text-xs tabular-nums ${itemActive ? "text-primary font-medium" : "text-muted-foreground"}`}
        >
          {kit.item_count} item type{kit.item_count !== 1 ? "s" : ""}
        </div>

        {/* Notes preview */}
        {kit.notes && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/60">
            {kit.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
