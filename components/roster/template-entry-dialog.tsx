"use client";

import { useState, useEffect } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createTemplateEntry,
  updateTemplateEntry,
  deleteTemplateEntry,
} from "@/lib/terms/actions";
import type { TermTemplateWithRelations } from "@/lib/terms/actions";
import type { Centre, Profile } from "@/lib/types/database";
import { SPORTS } from "@/lib/types/enums";
import { ClassChipPicker } from "./class-chip-picker";

// ============================================================
// Constants
// ============================================================

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "60 minutes" },
  { value: 90, label: "90 minutes" },
];

// ============================================================
// Component
// ============================================================

interface TemplateEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string;
  entry?: TermTemplateWithRelations;
  centres: Pick<Centre, "id" | "name">[];
  coaches: Pick<Profile, "id" | "name">[];
  defaultDay?: number;
  defaultTime?: string;
  onSuccess: () => void;
}

export function TemplateEntryDialog({
  open,
  onOpenChange,
  termId,
  entry,
  centres,
  coaches,
  defaultDay,
  defaultTime,
  onSuccess,
}: TemplateEntryDialogProps) {
  const isEdit = !!entry;

  const [dayOfWeek, setDayOfWeek] = useState<number>(defaultDay ?? 1);
  const [time, setTime] = useState(defaultTime ?? "09:00");
  const [duration, setDuration] = useState<number>(45);
  const [centreId, setCentreId] = useState("");
  const [sport, setSport] = useState("");
  const [coachId, setCoachId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setDayOfWeek(entry.day_of_week);
      setTime(entry.time.slice(0, 5)); // "HH:mm:ss" → "HH:mm"
      setDuration(entry.duration_minutes);
      setCentreId(entry.centre_id);
      setSport(entry.sport);
      setCoachId(entry.default_coach_id ?? "");
      setClassIds(entry.school_class_ids ?? []);
    } else {
      setDayOfWeek(defaultDay ?? 1);
      setTime(defaultTime ?? "09:00");
      setDuration(45);
      setCentreId("");
      setSport("");
      setCoachId("");
      setClassIds([]);
    }
    setError(null);
  }, [entry, open, defaultDay, defaultTime]);

  async function handleSubmit() {
    if (!centreId) {
      setError("Please select a centre.");
      return;
    }
    if (!sport) {
      setError("Please select a sport.");
      return;
    }

    setLoading(true);
    setError(null);

    if (isEdit && entry) {
      const { error: updateError } = await updateTemplateEntry(entry.id, {
        day_of_week: dayOfWeek,
        time,
        duration_minutes: duration,
        centre_id: centreId,
        sport,
        default_coach_id: coachId || null,
        school_class_ids: classIds.length > 0 ? classIds : null,
      });
      setLoading(false);
      if (updateError) {
        setError(updateError);
        return;
      }
    } else {
      const { error: createError } = await createTemplateEntry({
        term_id: termId,
        day_of_week: dayOfWeek,
        time,
        duration_minutes: duration,
        centre_id: centreId,
        sport,
        default_coach_id: coachId || undefined,
        school_class_ids: classIds.length > 0 ? classIds : null,
      });
      setLoading(false);
      if (createError) {
        setError(createError);
        return;
      }
    }

    onOpenChange(false);
    onSuccess();
  }

  async function handleDelete() {
    if (!entry) return;
    if (!confirm("Delete this template entry?")) return;

    setDeleting(true);
    const { error: delError } = await deleteTemplateEntry(entry.id);
    setDeleting(false);

    if (delError) {
      setError(delError);
      return;
    }

    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Template Entry" : "Add Template Entry"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this recurring session slot"
              : "Add a recurring session to the weekly template"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Day + Time row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select
                value={dayOfWeek.toString()}
                onValueChange={(val) => setDayOfWeek(parseInt(val ?? "0", 10))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value.toString()}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entryTime">Time</Label>
              <Input
                id="entryTime"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <Select
              value={duration.toString()}
              onValueChange={(val) => setDuration(parseInt(val ?? "0", 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value.toString()}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Centre */}
          <div className="space-y-2">
            <Label>Centre</Label>
            <Select value={centreId} onValueChange={(v) => setCentreId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a centre" />
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

          {/* Sport */}
          <div className="space-y-2">
            <Label>Sport</Label>
            <Select value={sport} onValueChange={(v) => setSport(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a sport" />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Coach (optional) */}
          <div className="space-y-2">
            <Label>Default Coach (optional)</Label>
            <Select value={coachId} onValueChange={(v) => setCoachId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {coaches.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Classes (renders only for schools with a class list) */}
          <ClassChipPicker
            centreId={centreId || null}
            value={classIds}
            onChange={setClassIds}
            disabled={loading}
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div>
            {isEdit && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Add Entry"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
