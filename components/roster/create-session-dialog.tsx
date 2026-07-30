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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSession,
  createRecurringSessions,
  updateSession,
  deleteSession,
} from "@/lib/sessions/actions";
import type { RecurrenceFrequency } from "@/lib/utils/roster";
import { SPORTS } from "@/lib/types/enums";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Centre, Profile } from "@/lib/types/database";

// ============================================================
// Props
// ============================================================

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string;
  centres: Pick<Centre, "id" | "name">[];
  coaches: Pick<Profile, "id" | "name">[];
  defaultDate?: string;
  defaultTime?: string;
  defaultCoachId?: string;
  editSession?: SessionWithRelations;
  onSuccess: () => void;
}

// ============================================================
// Component
// ============================================================

export function CreateSessionDialog({
  open,
  onOpenChange,
  termId,
  centres,
  coaches,
  defaultDate,
  defaultTime,
  defaultCoachId,
  editSession,
  onSuccess,
}: CreateSessionDialogProps) {
  const isEdit = !!editSession;

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("0.75"); // hours
  const [centreId, setCentreId] = useState("");
  const [sport, setSport] = useState("");
  const [coachId, setCoachId] = useState("");
  const [payRateOverride, setPayRateOverride] = useState("");
  const [repeatFreq, setRepeatFreq] = useState<RecurrenceFrequency | "none">(
    "none"
  );
  const [repeatUntil, setRepeatUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset form when dialog opens/closes or editSession changes
  useEffect(() => {
    if (open) {
      if (editSession) {
        setDate(editSession.date);
        setTime(editSession.time.slice(0, 5));
        setDuration(
          (Math.round((editSession.duration_minutes / 60) * 100) / 100).toString()
        );
        setCentreId(editSession.centre_id);
        setSport(editSession.sport);
        setCoachId(editSession.coach_id ?? "");
        setPayRateOverride(
          editSession.pay_rate_override?.toString() ?? ""
        );
      } else {
        setDate(defaultDate ?? "");
        setTime(defaultTime ?? "");
        setDuration("0.75");
        setCentreId("");
        setSport("");
        setCoachId(defaultCoachId ?? "");
        setPayRateOverride("");
      }
      setRepeatFreq("none");
      setRepeatUntil("");
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, editSession, defaultDate, defaultTime, defaultCoachId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time || !centreId || !sport) {
      setError("Please fill in all required fields.");
      return;
    }
    const durationMinutes = Math.round(parseFloat(duration) * 60);
    if (!durationMinutes || durationMinutes <= 0) {
      setError("Enter a valid duration in hours.");
      return;
    }

    setSaving(true);
    setError(null);

    if (isEdit) {
      const { error: err } = await updateSession(editSession!.id, {
        date,
        time,
        duration_minutes: durationMinutes,
        centre_id: centreId,
        sport,
        coach_id: coachId || null,
        pay_rate_override: payRateOverride
          ? parseFloat(payRateOverride)
          : null,
      });
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }
    } else {
      const input = {
        term_id: termId,
        date,
        time,
        duration_minutes: durationMinutes,
        centre_id: centreId,
        sport,
        coach_id: coachId || undefined,
        pay_rate_override: payRateOverride
          ? parseFloat(payRateOverride)
          : undefined,
      };

      if (repeatFreq !== "none") {
        if (!repeatUntil) {
          setError("Choose an end date for the repeat.");
          setSaving(false);
          return;
        }
        const { data: result, error: err } = await createRecurringSessions(
          input,
          { frequency: repeatFreq, until: repeatUntil }
        );
        if (err || !result) {
          setError(err ?? "Failed to create recurring sessions.");
          setSaving(false);
          return;
        }
        toast.success(
          `${result.created} session${result.created === 1 ? "" : "s"} created` +
            (result.skipped.length > 0
              ? ` — ${result.skipped.length} date${
                  result.skipped.length === 1 ? "" : "s"
                } skipped (already booked)`
              : "") +
            "."
        );
        if (result.firstError) {
          toast.warning(`Some dates failed — first: ${result.firstError}`);
        }
      } else {
        const { error: err } = await createSession(input);
        if (err) {
          setError(err);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    onOpenChange(false);
    onSuccess();
  }

  async function handleDelete() {
    if (!editSession) return;
    setSaving(true);
    const { error: err } = await deleteSession(editSession.id);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Session" : "Add Session"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the session details below."
              : "Fill in the session details to create a new session."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="session-date">Date *</Label>
            <Input
              id="session-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label htmlFor="session-time">Time *</Label>
            <Input
              id="session-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label htmlFor="session-duration">Duration (hours) *</Label>
            <Input
              id="session-duration"
              type="number"
              min={0.25}
              step="any"
              placeholder="e.g. 1.5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
            />
          </div>

          {/* Centre */}
          <div className="space-y-1.5">
            <Label>Centre *</Label>
            <Select value={centreId} onValueChange={(v) => setCentreId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select centre" />
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
          <div className="space-y-1.5">
            <Label>Sport *</Label>
            <Select value={sport} onValueChange={(v) => setSport(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select sport" />
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
          <div className="space-y-1.5">
            <Label>Coach</Label>
            <Select value={coachId} onValueChange={(v) => setCoachId(v ?? "")}>
              <SelectTrigger>
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

          {/* Pay Rate Override (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-override">Pay Rate Override ($)</Label>
            <Input
              id="pay-override"
              type="number"
              step="0.01"
              value={payRateOverride}
              onChange={(e) => setPayRateOverride(e.target.value)}
              placeholder="Leave empty for default rate"
            />
          </div>

          {/* Recurrence — create mode only; edits touch a single shift */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Repeats</Label>
                <Select
                  value={repeatFreq}
                  onValueChange={(v) =>
                    setRepeatFreq((v as RecurrenceFrequency | "none") ?? "none")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Does not repeat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="four_weekly">
                      Monthly (every 4 weeks)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {repeatFreq !== "none" && (
                <div className="space-y-1.5">
                  <Label htmlFor="repeat-until">Until</Label>
                  <Input
                    id="repeat-until"
                    type="date"
                    value={repeatUntil}
                    min={date || undefined}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            {/* Delete (edit mode only, draft sessions only) */}
            {isEdit && editSession.status === "draft" && (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Delete?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={handleDelete}
                    >
                      Yes, Delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                )}
              </div>
            )}
            {(!isEdit || editSession.status !== "draft") && <div />}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Saving..."
                  : isEdit
                    ? "Update Session"
                    : "Create Session"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
