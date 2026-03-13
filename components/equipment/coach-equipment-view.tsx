"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachEquipmentCheckin } from "./coach-equipment-checkin";
import { getCoachAssignedKits } from "@/lib/equipment/actions";
import type { KitListItem } from "@/lib/equipment/types";

// ============================================================
// Coach Equipment View — assigned kits with check-in actions
// ============================================================

interface CoachEquipmentViewProps {
  initialKits: KitListItem[];
}

const CONDITION_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode | null }
> = {
  good: { label: "Good", color: "text-green-700 bg-green-50", icon: null },
  needs_attention: {
    label: "Needs Attention",
    color: "text-orange-700 bg-orange-50",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  needs_replacement: {
    label: "Replace",
    color: "text-red-700 bg-red-50",
    icon: <XCircle className="h-3 w-3" />,
  },
};

export function CoachEquipmentView({ initialKits }: CoachEquipmentViewProps) {
  const [kits, setKits] = useState(initialKits);
  const [expandedKit, setExpandedKit] = useState<string | null>(null);

  async function refreshKits() {
    const { data } = await getCoachAssignedKits();
    if (data) setKits(data);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">My Equipment</h1>
        <p className="text-sm text-muted-foreground">
          Equipment kits assigned to you. Check in after each session.
        </p>
      </div>

      {kits.length > 0 ? (
        <div className="space-y-3">
          {kits.map((kit) => {
            const isExpanded = expandedKit === kit.id;
            const conditionInfo =
              CONDITION_CONFIG[kit.condition] ?? CONDITION_CONFIG.good;

            return (
              <div key={kit.id} className="space-y-2">
                <Card
                  className="cursor-pointer card-hover"
                  onClick={() =>
                    setExpandedKit(isExpanded ? null : kit.id)
                  }
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {kit.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {kit.item_count} item type
                          {kit.item_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] gap-1 ${conditionInfo.color}`}
                      >
                        {conditionInfo.icon}
                        {conditionInfo.label}
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground/60" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                {isExpanded && (
                  <CoachEquipmentCheckin kit={kit} onComplete={refreshKits} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center pt-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-3 text-sm font-medium text-foreground">
            No equipment assigned
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Equipment kits will appear here when assigned to you.
          </p>
        </div>
      )}
    </div>
  );
}
