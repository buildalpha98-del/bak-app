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

interface EquipmentCardProps {
  kit: KitListItem;
  onClick: (kit: KitListItem) => void;
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

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md card-hover"
      onClick={() => onClick(kit)}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="h-5 w-5 shrink-0 text-primary" />
            <h3 className="text-sm font-medium text-foreground truncate">
              {kit.name}
            </h3>
          </div>
          <Badge
            variant={condition.variant}
            className="shrink-0 text-[10px] gap-1"
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
        <div className="mt-1.5 text-xs text-muted-foreground">
          {kit.item_count} item type{kit.item_count !== 1 ? "s" : ""}
        </div>

        {/* Notes preview */}
        {kit.notes && (
          <p className="mt-2 text-xs text-muted-foreground/60 line-clamp-2">{kit.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
