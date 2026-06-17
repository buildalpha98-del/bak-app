"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  Package,
  Pencil,
  Trash2,
  Minus,
  Download,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  bulkMarkInventoryDamaged,
  bulkMoveInventoryToCentre,
  exportInventoryCsv,
} from "@/lib/equipment/actions";
import type { InventoryItem, InventoryCondition } from "@/lib/equipment/types";
import { SPORTS } from "@/lib/types/enums";
import { toast } from "sonner";

// ============================================================
// Inventory List — URL-persisted filters + bulk select + design refresh
// ============================================================

interface InventoryListProps {
  initialItems: InventoryItem[];
  userRole: "admin" | "ops";
  centres: { id: string; name: string }[];
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
  // Restrained brand orange tint for poor / retired
  poor: "bg-[#E8712A]/10 text-[#E8712A]",
  retired: "bg-[#E8712A]/10 text-[#E8712A]",
};

const LOCATION_OPTIONS = [
  "warehouse",
  "in kit",
  "with coach",
  "at centre",
  "other",
] as const;

export function InventoryList({
  initialItems,
  userRole,
  centres,
}: InventoryListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Bulk-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveLocation, setMoveLocation] = useState("");

  // URL-persisted filters
  const search = searchParams.get("search") ?? "";
  const conditionFilter = searchParams.get("condition") ?? "all";
  const itemTypeFilter = searchParams.get("itemType") ?? "all";

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

  // Form state
  const [formName, setFormName] = useState("");
  const [formSport, setFormSport] = useState<string[]>([]);
  const [formQuantity, setFormQuantity] = useState(1);
  const [formCondition, setFormCondition] = useState<InventoryCondition>("good");
  const [formLocation, setFormLocation] = useState("warehouse");
  const [formNotes, setFormNotes] = useState("");

  // Unique item-name "types" for the filter dropdown
  const itemTypes = useMemo(() => {
    const names = new Set<string>();
    for (const i of items) names.add(i.name);
    return Array.from(names).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          item.name.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.sport.some((s) => s.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (conditionFilter !== "all") {
        if (conditionFilter === "damaged") {
          if (item.condition !== "poor" && item.condition !== "retired")
            return false;
        } else if (item.condition !== conditionFilter) {
          return false;
        }
      }
      if (itemTypeFilter !== "all" && item.name !== itemTypeFilter) return false;
      return true;
    });
  }, [items, search, conditionFilter, itemTypeFilter]);

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
    } else {
      toast.error(error);
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
    } else {
      toast.error(error);
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
    } else {
      toast.error(error);
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
        : [...prev, sport],
    );
  }

  // Bulk-select handlers
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleBulkMarkDamaged() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkActing(true);
    const result = await bulkMarkInventoryDamaged(ids);
    setBulkActing(false);
    if (result.error && result.updated === 0) {
      toast.error(result.error);
    } else {
      toast.success(
        `Marked ${result.updated} item${result.updated === 1 ? "" : "s"} as damaged.`,
      );
      setSelectedIds(new Set());
      await refresh();
    }
  }

  async function handleBulkMove() {
    const ids = Array.from(selectedIds);
    if (!ids.length || !moveLocation) {
      toast.error("Pick a destination.");
      return;
    }
    setBulkActing(true);
    const result = await bulkMoveInventoryToCentre(ids, moveLocation);
    setBulkActing(false);
    if (result.error && result.updated === 0) {
      toast.error(result.error);
    } else {
      toast.success(
        `Moved ${result.updated} item${result.updated === 1 ? "" : "s"} to ${moveLocation}.`,
      );
      setSelectedIds(new Set());
      setMoveOpen(false);
      setMoveLocation("");
      await refresh();
    }
  }

  async function handleBulkExport() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkActing(true);
    const result = await exportInventoryCsv(ids);
    setBulkActing(false);
    if (result.error || !result.csv) {
      toast.error(result.error ?? "Failed to export.");
      return;
    }
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
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
          className="rounded-2xl"
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
            className="rounded-2xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Condition</Label>
          <Select
            value={formCondition}
            onValueChange={(v) => setFormCondition(v as InventoryCondition)}
          >
            <SelectTrigger className="rounded-2xl">
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
        <Select
          value={formLocation}
          onValueChange={(v) => {
            if (v) setFormLocation(v);
          }}
        >
          <SelectTrigger className="rounded-2xl">
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
          className="rounded-2xl"
        />
      </div>
    </div>
  );

  return (
    <div>
      {/* Filter chip row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => updateParam("search", e.target.value)}
            placeholder="Search items, sports, locations..."
            className="rounded-2xl pl-9"
          />
        </div>
        <Select
          value={conditionFilter}
          onValueChange={(v) => updateParam("condition", v)}
        >
          <SelectTrigger className="w-[170px] rounded-2xl">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All conditions</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="fair">Fair</SelectItem>
            <SelectItem value="poor">Poor</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
            <SelectItem value="damaged">Damaged (poor or retired)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={itemTypeFilter}
          onValueChange={(v) => updateParam("itemType", v)}
        >
          <SelectTrigger className="w-[180px] rounded-2xl">
            <SelectValue placeholder="Item type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All item types</SelectItem>
            {itemTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={openAdd}
          className="bg-[#E8712A] hover:bg-[#E8712A]/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Desktop table */}
      {filtered.length > 0 ? (
        <>
          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
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
                  <TableRow
                    key={item.id}
                    data-state={selectedIds.has(item.id) ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleOne(item.id)}
                        aria-label={`Select ${item.name}`}
                      />
                    </TableCell>
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

          {/* Mobile cards */}
          <div className="mt-6 grid gap-3 md:hidden">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleOne(item.id)}
                      aria-label={`Select ${item.name}`}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {item.name}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${CONDITION_COLOURS[item.condition as InventoryCondition] ?? ""}`}
                  >
                    {CONDITION_LABELS[item.condition as InventoryCondition] ??
                      item.condition}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(item.sport ?? []).map((s) => (
                    <Badge key={s} variant="outline" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{item.location}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleInlineQuantity(item, -1)}
                      disabled={item.quantity <= 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium text-foreground">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border bg-muted/20 px-6 py-12 text-center">
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

      {/* Sticky bulk-action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {userRole === "admin" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkMarkDamaged}
                disabled={bulkActing}
              >
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                Mark as damaged
              </Button>
            )}
            {userRole === "admin" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMoveOpen(true)}
                disabled={bulkActing}
              >
                <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                Move to centre
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkExport}
              disabled={bulkActing}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkActing}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Move to Centre Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to centre</DialogTitle>
            <DialogDescription>
              Move the selected items to a centre&apos;s storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Destination centre</Label>
            <Select
              value={moveLocation}
              onValueChange={(v) => {
                if (v) setMoveLocation(v);
              }}
            >
              <SelectTrigger className="rounded-2xl">
                <SelectValue placeholder="Select a centre..." />
              </SelectTrigger>
              <SelectContent>
                {centres.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No centres available.
                  </div>
                )}
                {centres.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkMove}
              disabled={bulkActing || !moveLocation}
              className="bg-[#E8712A] hover:bg-[#E8712A]/90"
            >
              {bulkActing ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button
              onClick={handleCreate}
              disabled={saving || !formName.trim()}
              className="bg-[#E8712A] hover:bg-[#E8712A]/90"
            >
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
            <Button
              onClick={handleUpdate}
              disabled={saving || !formName.trim()}
              className="bg-[#E8712A] hover:bg-[#E8712A]/90"
            >
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
