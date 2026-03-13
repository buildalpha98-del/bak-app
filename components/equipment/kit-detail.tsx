"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Package,
  MapPin,
  User,
  Building2,
  Warehouse,
  AlertTriangle,
  XCircle,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  ArrowRightLeft,
  LogIn,
  LogOut,
  Calendar,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  updateKit,
  deleteKit,
  addItem,
  updateItem,
  removeItem,
  checkOutKit,
  checkInKit,
  getCoachesSimple,
  getCentresSimple,
} from "@/lib/equipment/actions";
import type { KitDetail as KitDetailType } from "@/lib/equipment/types";
import type {
  EquipmentLocationType,
  EquipmentCondition,
  ItemCondition,
  EquipmentAction,
} from "@/lib/types/enums";
import type { EquipmentItem, EquipmentLog } from "@/lib/types/database";
import { toast } from "sonner";

// ============================================================
// Kit Detail — full detail view with items, logs, actions
// ============================================================

interface KitDetailProps {
  kit: KitDetailType;
  userRole: "admin" | "ops";
  basePath: string;
}

const ACTION_LABELS: Record<EquipmentAction, { label: string; icon: React.ReactNode }> = {
  check_out: { label: "Checked Out", icon: <LogOut className="h-3.5 w-3.5 text-primary" /> },
  check_in: { label: "Checked In", icon: <LogIn className="h-3.5 w-3.5 text-green-600" /> },
  issue_flagged: { label: "Issue Flagged", icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> },
  created: { label: "Created", icon: <Plus className="h-3.5 w-3.5 text-blue-500" /> },
  updated: { label: "Updated", icon: <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> },
};

const CONDITION_COLORS: Record<string, string> = {
  good: "text-green-700 bg-green-50",
  fair: "text-yellow-700 bg-yellow-50",
  poor: "text-orange-700 bg-orange-50",
  missing: "text-red-700 bg-red-50",
  needs_attention: "text-orange-700 bg-orange-50",
  needs_replacement: "text-red-700 bg-red-50",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KitDetailView({ kit, userRole, basePath }: KitDetailProps) {
  const router = useRouter();

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(kit.name);
  const [editCondition, setEditCondition] = useState<EquipmentCondition>(kit.condition);
  const [editNotes, setEditNotes] = useState(kit.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Items state
  const [items, setItems] = useState<EquipmentItem[]>(kit.items);
  const [newItemType, setNewItemType] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [addingItem, setAddingItem] = useState(false);

  // Check-out state
  const [showCheckout, setShowCheckout] = useState(false);
  const [coLocType, setCoLocType] = useState<EquipmentLocationType>("coach");
  const [coLocId, setCoLocId] = useState<string | null>(null);
  const [coNotes, setCoNotes] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Lookups
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);

  async function loadLookups() {
    if (lookupsLoaded) return;
    const [coachRes, centreRes] = await Promise.all([
      getCoachesSimple(),
      getCentresSimple(),
    ]);
    setCoaches(coachRes.data ?? []);
    setCentres(centreRes.data ?? []);
    setLookupsLoaded(true);
  }

  async function handleSaveEdit() {
    setSaving(true);
    const { error } = await updateKit(kit.id, {
      name: editName.trim() || kit.name,
      condition: editCondition,
      notes: editNotes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Kit updated.");
      setEditing(false);
      router.refresh();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const { error } = await deleteKit(kit.id);
    setDeleting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Kit deleted.");
      router.push(basePath);
    }
  }

  async function handleAddItem() {
    if (!newItemType.trim()) return;
    setAddingItem(true);
    const { data, error } = await addItem({
      kitId: kit.id,
      itemType: newItemType.trim(),
      quantity: newItemQty,
      condition: "good",
    });
    setAddingItem(false);
    if (error) {
      toast.error(error);
    } else if (data) {
      setItems([...items, data]);
      setNewItemType("");
      setNewItemQty(1);
      toast.success("Item added.");
    }
  }

  async function handleUpdateItemCondition(item: EquipmentItem, newCondition: ItemCondition) {
    const { error } = await updateItem(item.id, { condition: newCondition });
    if (error) {
      toast.error(error);
    } else {
      setItems(items.map((i) => (i.id === item.id ? { ...i, condition: newCondition } : i)));
    }
  }

  async function handleRemoveItem(item: EquipmentItem) {
    const { error } = await removeItem(item.id);
    if (error) {
      toast.error(error);
    } else {
      setItems(items.filter((i) => i.id !== item.id));
      toast.success("Item removed.");
    }
  }

  async function handleCheckOut() {
    if (!coLocId && coLocType !== "storage") {
      toast.error("Select a destination.");
      return;
    }
    setCheckingOut(true);
    const { error } = await checkOutKit(
      kit.id,
      coLocType,
      coLocType === "storage" ? null : coLocId,
      coNotes || undefined
    );
    setCheckingOut(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Kit checked out.");
      setShowCheckout(false);
      router.refresh();
    }
  }

  async function handleCheckIn() {
    setCheckingIn(true);
    const { error } = await checkInKit(kit.id);
    setCheckingIn(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Kit checked in to storage.");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push(basePath)}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Equipment
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">{kit.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                className={`text-xs ${CONDITION_COLORS[kit.condition] ?? ""}`}
                variant="secondary"
              >
                {kit.condition === "good"
                  ? "Good"
                  : kit.condition === "needs_attention"
                  ? "Needs Attention"
                  : "Needs Replacement"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {kit.location_type === "coach" && kit.assigned_coach_name
                  ? `With ${kit.assigned_coach_name}`
                  : kit.location_type === "centre" && kit.assigned_centre_name
                  ? `At ${kit.assigned_centre_name}`
                  : "In Storage"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {kit.location_type !== "storage" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckIn}
              disabled={checkingIn}
            >
              {checkingIn ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-1.5 h-4 w-4" />
              )}
              Check In
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowCheckout(!showCheckout);
              loadLookups();
            }}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Check Out
          </Button>
        </div>
      </div>

      {/* Check-out form */}
      {showCheckout && (
        <Card className="mt-4 border-primary/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-foreground mb-3">
              Check Out Kit
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Destination</Label>
                <Select
                  value={coLocType}
                  onValueChange={(v) => {
                    setCoLocType(v as EquipmentLocationType);
                    setCoLocId(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coach">Coach</SelectItem>
                    <SelectItem value="centre">Centre</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {coLocType === "coach" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Coach</Label>
                  <Select value={coLocId ?? ""} onValueChange={setCoLocId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {coaches.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {coLocType === "centre" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Centre</Label>
                  <Select value={coLocId ?? ""} onValueChange={setCoLocId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {centres.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={coNotes}
                onChange={(e) => setCoNotes(e.target.value)}
                placeholder="Check-out notes..."
              />
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={handleCheckOut}
                disabled={checkingOut}
              >
                {checkingOut && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                Confirm Check Out
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCheckout(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Session */}
      {kit.linked_session && (
        <Card className="mt-4 border-blue-200 bg-blue-50/50">
          <CardContent className="flex items-center gap-3 p-3">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800">
              Assigned to upcoming session: {kit.linked_session.sport} at{" "}
              {kit.linked_session.centre_name} on{" "}
              {formatDate(kit.linked_session.date)}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Left column: Details + Items */}
        <div className="space-y-6">
          {/* Kit Details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
              {!editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Condition</Label>
                    <Select
                      value={editCondition}
                      onValueChange={(v) =>
                        setEditCondition(v as EquipmentCondition)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="needs_attention">
                          Needs Attention
                        </SelectItem>
                        <SelectItem value="needs_replacement">
                          Needs Replacement
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                      {saving && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {kit.location_type === "coach"
                        ? `Coach: ${kit.assigned_coach_name ?? "Unknown"}`
                        : kit.location_type === "centre"
                        ? `Centre: ${kit.assigned_centre_name ?? "Unknown"}`
                        : "Storage"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Created {formatDate(kit.created_at)}</span>
                  </div>
                  {kit.notes && (
                    <p className="pt-1 text-xs text-muted-foreground/60">{kit.notes}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Kit Contents ({items.length} item type{items.length !== 1 ? "s" : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {item.item_type}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          x{item.quantity}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={item.condition}
                          onValueChange={(v) =>
                            handleUpdateItemCondition(item, v as ItemCondition)
                          }
                        >
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="good">Good</SelectItem>
                            <SelectItem value="fair">Fair</SelectItem>
                            <SelectItem value="poor">Poor</SelectItem>
                            <SelectItem value="missing">Missing</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item)}
                          className="text-muted-foreground/60 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60">No items in this kit.</p>
              )}

              {/* Add item */}
              <div className="mt-3 flex gap-2">
                <Input
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value)}
                  placeholder="Item type..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                />
                <Input
                  type="number"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                  className="w-14"
                  min={1}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddItem}
                  disabled={addingItem}
                >
                  {addingItem ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Delete */}
          {userRole === "admin" && (
            <Card>
              <CardContent className="p-4">
                {!confirmDelete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete Kit
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={handleDelete}
                    >
                      {deleting && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Confirm Delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Audit Log */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              {kit.logs.length > 0 ? (
                <div className="space-y-3">
                  {kit.logs.map((log) => {
                    const actionInfo = ACTION_LABELS[log.action] ?? {
                      label: log.action,
                      icon: null,
                    };
                    return (
                      <div key={log.id} className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {actionInfo.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground">
                              {actionInfo.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">
                              {formatDateTime(log.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {log.user_name}
                            {log.notes ? ` — ${log.notes}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
