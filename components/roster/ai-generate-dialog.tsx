"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toLocalIso } from "@/lib/utils/roster";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// ============================================================
// Helpers
// ============================================================

/** Get next Monday from Sydney-today */
function getNextMonday(): string {
  const today = new Date(sydneyTodayIso() + "T00:00:00");
  const day = today.getDay();
  const daysUntil = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const monday = new Date(today);
  monday.setDate(monday.getDate() + daysUntil);
  return toLocalIso(monday);
}

/** Get Friday from a Monday date string */
function getFridayFromMonday(monday: string): string {
  const d = new Date(monday + "T00:00:00");
  d.setDate(d.getDate() + 4);
  return toLocalIso(d);
}

// ============================================================
// Component
// ============================================================

interface AIGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string;
  onGenerated: (runId: string) => void;
}

interface PreviewStats {
  sessionsCount: number;
  coachesCount: number;
}

export function AIGenerateDialog({
  open,
  onOpenChange,
  termId,
  onGenerated,
}: AIGenerateDialogProps) {
  const [weekStart, setWeekStart] = useState(getNextMonday);
  const [keepExisting, setKeepExisting] = useState(true);
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);

  // Reset preview when dialog opens
  useEffect(() => {
    if (open) {
      setPreviewStats(null);
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError(null);
      setPreviewStats(null);
      setWeekStart(getNextMonday());
      setKeepExisting(true);
      setIncludeUnconfirmed(false);
    }
    onOpenChange(nextOpen);
  }

  function handleWeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!value) return;

    // Snap to Monday
    const d = new Date(value + "T00:00:00");
    const day = d.getDay();
    if (day !== 1) {
      const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
      d.setDate(d.getDate() + diff);
    }
    setWeekStart(toLocalIso(d));
  }

  async function handleGenerate() {
    if (!weekStart || !termId) return;

    setLoading(true);
    setError(null);

    try {
      const weekEnd = getFridayFromMonday(weekStart);
      const res = await fetch("/api/scheduling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          termId,
          keepExisting,
          includeUnconfirmed,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate schedule");
        setLoading(false);
        return;
      }

      if (data.runId) {
        handleOpenChange(false);
        onGenerated(data.runId);
      } else {
        setError("No scheduling run was created");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  const weekLabel = weekStart
    ? (() => {
        const mon = new Date(weekStart + "T00:00:00");
        const fri = new Date(mon);
        fri.setDate(fri.getDate() + 4);
        const monStr = mon.toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
        });
        const friStr = fri.toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        return `${monStr} – ${friStr}`;
      })()
    : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            AI Generate Roster
          </DialogTitle>
          <DialogDescription>
            Automatically assign coaches to sessions using AI scheduling
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Week picker */}
          <div className="space-y-2">
            <Label>Week starting</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={handleWeekChange}
              className="w-full"
            />
            {weekLabel && (
              <p className="text-xs text-muted-foreground">{weekLabel}</p>
            )}
          </div>

          {/* Preview stats */}
          {previewStats && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm text-foreground">
                <span className="font-medium">{previewStats.sessionsCount}</span>{" "}
                session{previewStats.sessionsCount !== 1 ? "s" : ""} to assign,{" "}
                <span className="font-medium">{previewStats.coachesCount}</span>{" "}
                coach{previewStats.coachesCount !== 1 ? "es" : ""} available
              </p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="keep-existing"
                checked={keepExisting}
                onCheckedChange={(checked) =>
                  setKeepExisting(checked === true)
                }
              />
              <Label htmlFor="keep-existing" className="text-sm font-normal">
                Keep existing coach assignments
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-unconfirmed"
                checked={includeUnconfirmed}
                onCheckedChange={(checked) =>
                  setIncludeUnconfirmed(checked === true)
                }
              />
              <Label htmlFor="include-unconfirmed" className="text-sm font-normal">
                Include unconfirmed coaches
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={loading || !weekStart || !termId}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
