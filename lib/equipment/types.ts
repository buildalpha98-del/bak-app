import type {
  EquipmentLocationType,
  EquipmentCondition,
  ItemCondition,
  EquipmentAction,
} from "@/lib/types/enums";
import type {
  EquipmentKit,
  EquipmentItem,
  EquipmentLog,
} from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface KitListItem extends EquipmentKit {
  item_count: number;
  assigned_coach_name: string | null;
  assigned_centre_name: string | null;
}

export interface KitDetail extends EquipmentKit {
  items: EquipmentItem[];
  logs: (EquipmentLog & { user_name: string })[];
  assigned_coach_name: string | null;
  assigned_centre_name: string | null;
  linked_session: {
    id: string;
    date: string;
    sport: string;
    centre_name: string;
  } | null;
}

export interface CreateKitInput {
  name: string;
  locationType: EquipmentLocationType;
  locationId: string | null;
  condition: EquipmentCondition;
  notes: string | null;
  items: { itemType: string; quantity: number; condition: ItemCondition }[];
}

export interface UpdateKitInput {
  name?: string;
  locationType?: EquipmentLocationType;
  locationId?: string | null;
  condition?: EquipmentCondition;
  notes?: string | null;
}

export interface AddItemInput {
  kitId: string;
  itemType: string;
  quantity: number;
  condition: ItemCondition;
}

export interface UpdateItemInput {
  quantity?: number;
  condition?: ItemCondition;
}

export interface ReportIssueInput {
  kitId: string;
  notes: string;
  issuesJson: Record<string, unknown>;
}

export interface KitFilters {
  search?: string;
  locationType?: EquipmentLocationType | "all";
  condition?: EquipmentCondition | "all";
}

// Standard equipment items for the picker
export const STANDARD_EQUIPMENT = [
  "Cones",
  "Balls",
  "Bibs",
  "Hoops",
  "Ladders",
  "Mats",
  "Ropes",
  "Markers",
  "Nets",
  "Goals",
  "Rackets",
  "Bats",
  "Stumps",
  "Tees",
  "Whistles",
  "Stopwatch",
  "First Aid Kit",
  "Pump",
] as const;
