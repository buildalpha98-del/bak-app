"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createKit,
  getCoachesSimple,
  getCentresSimple,
} from "@/lib/equipment/actions";
import { STANDARD_EQUIPMENT } from "@/lib/equipment/types";
import type {
  EquipmentLocationType,
  EquipmentCondition,
  ItemCondition,
} from "@/lib/types/enums";
import { toast } from "sonner";

// ============================================================
// Kit Form Dialog — create new equipment kit
// ============================================================

interface KitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface DraftItem {
  itemType: string;
  quantity: number;
  condition: ItemCondition;
}

export function KitFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: KitFormDialogProps) {
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<EquipmentLocationType>("storage");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [condition, setCondition] = useState<EquipmentCondition>("good");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Lookup data
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Quick-add item
  const [quickItem, setQuickItem] = useState("");
  const [quickQuantity, setQuickQuantity] = useState(1);

  useEffect(() => {
    if (open) {
      setLoadingLookups(true);
      Promise.all([getCoachesSimple(), getCentresSimple()]).then(
        ([coachRes, centreRes]) => {
          setCoaches(coachRes.data ?? []);
          setCentres(centreRes.data ?? []);
          setLoadingLookups(false);
        }
      );
    } else {
      // Reset form
      setName("");
      setLocationType("storage");
      setLocationId(null);
      setCondition("good");
      setNotes("");
      setItems([]);
      setQuickItem("");
      setQuickQuantity(1);
    }
  }, [open]);

  function handleAddItem() {
    const itemType = quickItem.trim();
    if (!itemType) return;
    if (items.some((i) => i.itemType.toLowerCase() === itemType.toLowerCase())) {
      toast.error("Item already added.");
      return;
    }
    setItems([...items, { itemType, quantity: quickQuantity, condition: "good" }]);
    setQuickItem("");
    setQuickQuantity(1);
  }

  function handleAddStandardItem(itemType: string) {
    if (items.some((i) => i.itemType.toLowerCase() === itemType.toLowerCase())) return;
    setItems([...items, { itemType, quantity: 1, condition: "good" }]);
  }

  function handleRemoveItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function handleItemQuantityChange(index: number, qty: number) {
    const updated = [...items];
    updated[index].quantity = Math.max(1, qty);
    setItems(updated);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Please enter a kit name.");
      return;
    }

    setSaving(true);
    const { error } = await createKit({
      name: name.trim(),
      locationType,
      locationId: locationType === "storage" ? null : locationId,
      condition,
      notes: notes.trim() || null,
      items,
    });
    setSaving(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success("Kit created successfully.");
      onOpenChange(false);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Equipment Kit</DialogTitle>
          <DialogDescription>
            Create a new equipment bag/container with its contents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Kit Name */}
          <div className="space-y-1.5">
            <Label>Kit Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Soccer Kit A, Multi-Sport Bag 1"
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select
                value={locationType}
                onValueChange={(v) => {
                  setLocationType(v as EquipmentLocationType);
                  setLocationId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="centre">Centre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {locationType === "coach" && (
              <div className="space-y-1.5">
                <Label>Assigned Coach</Label>
                <Select
                  value={locationId ?? ""}
                  onValueChange={setLocationId}
                  disabled={loadingLookups}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select coach..." />
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

            {locationType === "centre" && (
              <div className="space-y-1.5">
                <Label>Assigned Centre</Label>
                <Select
                  value={locationId ?? ""}
                  onValueChange={setLocationId}
                  disabled={loadingLookups}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select centre..." />
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

          {/* Condition */}
          <div className="space-y-1.5">
            <Label>Overall Condition</Label>
            <Select
              value={condition}
              onValueChange={(v) => setCondition(v as EquipmentCondition)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="needs_attention">Needs Attention</SelectItem>
                <SelectItem value="needs_replacement">Needs Replacement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this kit..."
            />
          </div>

          <Separator />

          {/* Items */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Kit Contents</Label>

            {/* Standard equipment quick-add */}
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_EQUIPMENT.map((item) => {
                const isAdded = items.some(
                  (i) => i.itemType.toLowerCase() === item.toLowerCase()
                );
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleAddStandardItem(item)}
                    disabled={isAdded}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      isAdded
                        ? "bg-[var(--brand-orange-light)] text-primary font-medium"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            {/* Custom item add */}
            <div className="flex gap-2">
              <Input
                value={quickItem}
                onChange={(e) => setQuickItem(e.target.value)}
                placeholder="Custom item type..."
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
                value={quickQuantity}
                onChange={(e) => setQuickQuantity(parseInt(e.target.value) || 1)}
                className="w-16"
                min={1}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddItem}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Added items list */}
            {items.length > 0 && (
              <div className="space-y-1.5 rounded-lg border p-3">
                {items.map((item, idx) => (
                  <div
                    key={item.itemType}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-foreground">{item.itemType}</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemQuantityChange(
                            idx,
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="h-7 w-14 text-center text-xs"
                        min={1}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && (
              <p className="text-xs text-muted-foreground/60">
                Tap standard items above or add custom items.
              </p>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Kit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
