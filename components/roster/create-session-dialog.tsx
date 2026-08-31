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
  createSportRotationSessions,
  repeatSessionForward,
  updateSession,
  deleteSession,
  type SportRotationBlock,
} from "@/lib/sessions/actions";
import type { RecurrenceFrequency } from "@/lib/utils/roster";
import { SPORTS } from "@/lib/types/enums";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import { ClassChipPicker } from "./class-chip-picker";
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
  const [classIds, setClassIds] = useState<string[]>([]);
  const [payRateOverride, setPayRateOverride] = useState("");
  const [repeatFreq, setRepeatFreq] = useState<RecurrenceFrequency | "none">(
    "none"
  );
  const [repeatUntil, setRepeatUntil] = useState("");
  const [rotateSports, setRotateSports] = useState(false);
  const [sportBlocks, setSportBlocks] = useState<
    { sport: string; weeks: string }[]
  >([
    { sport: "", weeks: "2" },
    { sport: "", weeks: "2" },
  ]);
  const [saving, setSaving] = useState(false);
  const [repeating, setRepeating] = useState(false);
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
        setClassIds(editSession.school_class_ids ?? []);
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
        setClassIds([]);
        setPayRateOverride("");
      }
      setRepeatFreq("none");
      setRepeatUntil("");
      setRotateSports(false);
      setSportBlocks([
        { sport: "", weeks: "2" },
        { sport: "", weeks: "2" },
      ]);
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, editSession, defaultDate, defaultTime, defaultCoachId]);

  function updateSportBlock(
    index: number,
    patch: Partial<{ sport: string; weeks: string }>
  ) {
    setSportBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b))
    );
  }
  function addSportBlock() {
    setSportBlocks((prev) => [...prev, { sport: "", weeks: "2" }]);
  }
  function removeSportBlock(index: number) {
    setSportBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time || !centreId || (!rotateSports && !sport)) {
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
        school_class_ids: classIds.length > 0 ? classIds : null,
        pay_rate_override: payRateOverride
          ? parseFloat(payRateOverride)
          : null,
      });
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }
    } else if (rotateSports) {
      const blocks: SportRotationBlock[] = sportBlocks.map((b) => ({
        sport: b.sport,
        weeks: parseInt(b.weeks, 10),
      }));
      if (blocks.some((b) => !b.sport)) {
        setError("Choose a sport for every block.");
        setSaving(false);
        return;
      }
      if (blocks.some((b) => !b.weeks || b.weeks < 1)) {
        setError("Each block needs at least 1 week.");
        setSaving(false);
        return;
      }

      const { data: result, error: err } = await createSportRotationSessions(
        {
          term_id: termId,
          date,
          time,
          duration_minutes: durationMinutes,
          centre_id: centreId,
          coach_id: coachId || undefined,
          school_class_ids: classIds.length > 0 ? classIds : null,
          pay_rate_override: payRateOverride
            ? parseFloat(payRateOverride)
            : undefined,
        },
        blocks
      );
      if (err || !result) {
        setError(err ?? "Failed to create sport rotation sessions.");
        setSaving(false);
        return;
      }
      toast.success(
        `${result.created} session${result.created === 1 ? "" : "s"} created across ${blocks.length} sport block${blocks.length === 1 ? "" : "s"}` +
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
      const input = {
        term_id: termId,
        date,
        time,
        duration_minutes: durationMinutes,
        centre_id: centreId,
        sport,
        coach_id: coachId || undefined,
        school_class_ids: classIds.length > 0 ? classIds : null,
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

  async function handleRepeatForward() {
    if (!editSession || repeatFreq === "none" || !repeatUntil) return;
    setRepeating(true);
    setError(null);
    const { data: result, error: err } = await repeatSessionForward(
      editSession.id,
      { frequency: repeatFreq, until: repeatUntil }
    );
    setRepeating(false);
    if (err || !result) {
      setError(err ?? "Failed to repeat this shift.");
      return;
    }
    toast.success(
      `${result.created} shift${result.created === 1 ? "" : "s"} created` +
        (result.skipped.length > 0
          ? ` — ${result.skipped.length} skipped (already booked)`
          : "") +
        "."
    );
    if (result.firstError) {
      toast.warning(`Some dates failed — first: ${result.firstError}`);
    }
    setRepeatFreq("none");
    setRepeatUntil("");
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
          {!rotateSports && (
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
          )}

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

          {/* Classes (renders only for schools with a class list) */}
          <ClassChipPicker
            centreId={centreId || null}
            value={classIds}
            onChange={setClassIds}
            disabled={saving}
          />

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
          {!isEdit && !rotateSports && (
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

          {/* Sport rotation — create mode only, alternative to Repeats */}
          {!isEdit && (
            <div className="space-y-3">
              {repeatFreq === "none" && (
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={rotateSports}
                    onChange={(e) => setRotateSports(e.target.checked)}
                  />
                  Rotate through multiple sports (weekly blocks)
                </label>
              )}

              {rotateSports && (
                <div className="space-y-3 rounded-lg border p-3">
                  <Label>Sport Blocks *</Label>
                  {sportBlocks.map((block, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Sport
                        </Label>
                        <Select
                          value={block.sport}
                          onValueChange={(v) =>
                            updateSportBlock(i, { sport: v ?? "" })
                          }
                        >
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
                      <div className="w-24 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Weeks
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={block.weeks}
                          onChange={(e) =>
                            updateSportBlock(i, { weeks: e.target.value })
                          }
                        />
                      </div>
                      {sportBlocks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => removeSportBlock(i)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSportBlock}
                  >
                    + Add sport block
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Creates one weekly session per week for each block, back
                    to back, starting {date || "the date above"}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Repeat this shift — edit mode only, any status. Copies the
              shift forward; doesn't touch this shift's own fields. */}
          {isEdit && (
            <div className="space-y-3 rounded-lg border p-3">
              <Label>Repeat this shift going forward</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Frequency
                  </Label>
                  <Select
                    value={repeatFreq}
                    onValueChange={(v) =>
                      setRepeatFreq(
                        (v as RecurrenceFrequency | "none") ?? "none"
                      )
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
                <div className="space-y-1.5">
                  <Label
                    htmlFor="repeat-forward-until"
                    className="text-xs text-muted-foreground"
                  >
                    Until
                  </Label>
                  <Input
                    id="repeat-forward-until"
                    type="date"
                    value={repeatUntil}
                    min={date || undefined}
                    disabled={repeatFreq === "none"}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={repeating || repeatFreq === "none" || !repeatUntil}
                onClick={handleRepeatForward}
              >
                {repeating ? "Repeating…" : "Create repeats"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Copies this shift (same time, coach, centre and sport) into
                future weeks, starting the week after {date || "this shift"}.
                Doesn&apos;t change this shift itself.
              </p>
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
