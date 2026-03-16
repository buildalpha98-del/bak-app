"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Package,
  Pencil,
  Trash2,
  Minus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/lib/equipment/actions";
import type { InventoryItem, InventoryCondition } from "@/lib/equipment/types";
import { SPORTS } from "@/lib/types/enums";

// ============================================================
// Inventory List
// ============================================================

interface InventoryListProps {
  initialItems: InventoryItem[];
}

const CONDITION_LABELS: Record<InventoryCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  retired: "Retired",
};

const CONDITION_COLOURS: Record<InventoryCondition, string> = {
  new: "bg-blue-100 text-blue-800",
  good: "bg-green-100 text-green-800",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-orange-100 text-orange-800",
  retired: "bg-gray-100 text-gray-600",
};

const LOCATION_OPTIONS = [
  "warehouse",
  "in kit",
  "with coach",
  "at centre",
  "other",
] as const;

export function InventoryList({ initialItems }: InventoryListProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formSport, setFormSport] = useState<string[]>([]);
  const [formQuantity, setFormQuantity] = useState(1);
  const [formCondition, setFormCondition] = useState<InventoryCondition>("good");
  const [formLocation, setFormLocation] = useState("warehouse");
  const [formNotes, setFormNotes] = useState("");

  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      item.sport.some((s) => s.toLowerCase().includes(q))
    );
  });

  async function refresh() {
    const { data } = await getInventoryItems();
    if (data) setItems(data);
    router.refresh();
  }

  function resetForm() {
    setFormName("");
    setFormSport([]);
    setFormQuantity(1);
    setFormCondition("good");
    setFormLocation("warehouse");
    setFormNotes("");
  }

  function openAdd() {
    resetForm();
    setAddOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setFormName(item.name);
    setFormSport(item.sport ?? []);
    setFormQuantity(item.quantity);
    setFormCondition(item.condition as InventoryCondition);
    setFormLocation(item.location);
    setFormNotes(item.notes ?? "");
    setEditItem(item);
  }

  async function handleCreate() {
    if (!formName.trim()) return;
    setSaving(true);
    const { error } = await createInventoryItem({
      name: formName,
      sport: formSport,
      quantity: formQuantity,
      condition: formCondition,
      location: formLocation,
      notes: formNotes || null,
    });
    setSaving(false);
    if (!error) {
      setAddOpen(false);
      resetForm();
      await refresh();
    }
  }

  async function handleUpdate() {
    if (!editItem || !formName.trim()) return;
    setSaving(true);
    const { error } = await updateInventoryItem(editItem.id, {
      name: formName,
      sport: formSport,
      quantity: formQuantity,
      condition: formCondition,
      location: formLocation,
      notes: formNotes || null,
    });
    setSaving(false);
    if (!error) {
      setEditItem(null);
      resetForm();
      await refresh();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await deleteInventoryItem(deleteTarget.id);
    setSaving(false);
    if (!error) {
      setDeleteTarget(null);
      await refresh();
    }
  }

  async function handleInlineQuantity(item: InventoryItem, delta: number) {
    const newQty = Math.max(0, item.quantity + delta);
    await updateInventoryItem(item.id, { quantity: newQty });
    await refresh();
  }

  function toggleSport(sport: string) {
    setFormSport((prev) =>
      prev.includes(sport)
        ? prev.filter((s) => s !== sport)
        : [...prev, sport]
    );
  }

  // Shared form fields used by both Add and Edit dialogs
  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="inv-name">Item Name</Label>
        <Input
          id="inv-name"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Soccer Balls (Size 4)"
        />
      </div>

      <div className="space-y-2">
        <Label>Sport Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {SPORTS.map((sport) => (
            <Badge
              key={sport}
              variant={formSport.includes(sport) ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => toggleSport(sport)}
            >
              {sport}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="inv-qty">Quantity</Label>
          <Input
            id="inv-qty"
            type="number"
            min={0}
            value={formQuantity}
            onChange={(e) => setFormQuantity(parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>Condition</Label>
          <Select
            value={formCondition}
            onValueChange={(v) => setFormCondition(v as InventoryCondition)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONDITION_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Location</Label>
        <Select value={formLocation} onValueChange={(v) => { if (v) setFormLocation(v); }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCATION_OPTIONS.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc.charAt(0).toUpperCase() + loc.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="inv-notes">Notes</Label>
        <Textarea
          id="inv-notes"
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
        />
      </div>
    </div>
  );

  return (
    <div>
      {/* Search + Add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items, sports, locations..."
            className="pl-9"
          />
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Items table */}
      {filtered.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Sport(s)</TableHead>
                <TableHead className="text-center">Quantity</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(item.sport ?? []).map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                      {(!item.sport || item.sport.length === 0) && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleInlineQuantity(item, -1)}
                        disabled={item.quantity <= 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleInlineQuantity(item, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${CONDITION_COLOURS[item.condition as InventoryCondition] ?? ""}`}
                    >
                      {CONDITION_LABELS[item.condition as InventoryCondition] ??
                        item.condition}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {item.location}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-3 text-sm font-medium text-foreground">
            {items.length === 0
              ? "No inventory items yet"
              : "No items match your search"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length === 0
              ? "Add your first equipment item to start tracking inventory."
              : "Try adjusting your search."}
          </p>
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>
              Add a new equipment item to your inventory.
            </DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !formName.trim()}>
              {saving ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog
        open={editItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditItem(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>
              Update the details of this equipment item.
            </DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditItem(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving || !formName.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
