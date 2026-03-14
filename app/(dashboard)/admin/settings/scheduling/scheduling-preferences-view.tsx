"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Pencil, Trash2, Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  upsertSchedulingPreference,
  deleteSchedulingPreference,
} from "@/lib/scheduling/actions";
import type { Centre, Profile } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface SchedulingPreference {
  id: string;
  coach_id: string;
  centre_id: string;
  preference_type: "preferred" | "avoid";
  reason: string | null;
  learned: boolean;
  created_by: string;
  created_at: string;
  coach: { name: string } | { name: string }[] | null;
  centre: { name: string } | { name: string }[] | null;
}

interface SchedulingPreferencesViewProps {
  initialPreferences: SchedulingPreference[];
  coaches: Pick<Profile, "id" | "name">[];
  centres: Pick<Centre, "id" | "name">[];
}

// ============================================================
// Component
// ============================================================

export function SchedulingPreferencesView({
  initialPreferences,
  coaches,
  centres,
}: SchedulingPreferencesViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [preferenceType, setPreferenceType] = useState<"preferred" | "avoid">(
    "preferred"
  );
  const [reason, setReason] = useState("");

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setCoachId("");
    setCentreId("");
    setPreferenceType("preferred");
    setReason("");
  }

  function openAdd() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(pref: SchedulingPreference) {
    setEditingId(pref.id);
    setCoachId(pref.coach_id);
    setCentreId(pref.centre_id);
    setPreferenceType(pref.preference_type);
    setReason(pref.reason ?? "");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!coachId || !centreId) {
      toast.error("Please select both a coach and a centre.");
      return;
    }

    startTransition(async () => {
      const result = await upsertSchedulingPreference(
        coachId,
        centreId,
        preferenceType,
        reason || undefined
      );

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          editingId ? "Preference updated." : "Preference added."
        );
        setDialogOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteSchedulingPreference(deleteId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Preference deleted.");
        setDeleteId(null);
        router.refresh();
      }
    });
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Settings
          </p>
          <h1 className="text-2xl font-bold font-heading text-foreground">
            Scheduling Preferences
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage coach-centre preferences for the AI scheduling engine.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1.5 size-4" />
          Add Preference
        </Button>
      </div>

      {/* Table */}
      {initialPreferences.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No scheduling preferences configured yet.
          </p>
          <Button variant="outline" className="mt-4" onClick={openAdd}>
            <Plus className="mr-1.5 size-4" />
            Add First Preference
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Preference</TableHead>
                <TableHead className="hidden sm:table-cell">Reason</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialPreferences.map((pref) => (
                <TableRow key={pref.id}>
                  <TableCell className="font-medium">
                    {Array.isArray(pref.coach)
                      ? pref.coach[0]?.name ?? "Unknown"
                      : pref.coach?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell>
                    {Array.isArray(pref.centre)
                      ? pref.centre[0]?.name ?? "Unknown"
                      : pref.centre?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        pref.preference_type === "preferred"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {pref.preference_type === "preferred"
                        ? "Preferred"
                        : "Avoid"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                    {pref.reason || "\u2014"}
                  </TableCell>
                  <TableCell>
                    {pref.learned ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-xs border-blue-200 text-blue-700"
                      >
                        <Bot className="size-3" />
                        Auto-learned
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Manual
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(pref.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(pref)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-600 hover:text-red-700"
                        onClick={() => setDeleteId(pref.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Preference" : "Add Preference"}
            </DialogTitle>
            <DialogDescription>
              Configure a coach-centre scheduling preference.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="coach-select">Coach</Label>
              <Select value={coachId} onValueChange={(v) => v && setCoachId(v)}>
                <SelectTrigger id="coach-select">
                  <SelectValue placeholder="Select a coach..." />
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

            <div className="space-y-2">
              <Label htmlFor="centre-select">Centre</Label>
              <Select value={centreId} onValueChange={(v) => v && setCentreId(v)}>
                <SelectTrigger id="centre-select">
                  <SelectValue placeholder="Select a centre..." />
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

            <div className="space-y-2">
              <Label>Preference Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={
                    preferenceType === "preferred" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setPreferenceType("preferred")}
                >
                  Preferred
                </Button>
                <Button
                  type="button"
                  variant={
                    preferenceType === "avoid" ? "destructive" : "outline"
                  }
                  size="sm"
                  onClick={() => setPreferenceType("avoid")}
                >
                  Avoid
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this preference exists..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {editingId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preference</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this scheduling preference? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
