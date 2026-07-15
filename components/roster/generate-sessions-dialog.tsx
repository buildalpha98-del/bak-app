"use client";

import { useState, useMemo } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
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
import { generateSessionsForWeek } from "@/lib/terms/actions";
import type { Term } from "@/lib/types/database";
import { toLocalIso } from "@/lib/utils/roster";

// ============================================================
// Helpers
// ============================================================

/** Get all Monday dates within the term date range */
function getWeeksInTerm(
  startDate: string,
  endDate: string
): { value: string; label: string }[] {
  const weeks: { value: string; label: string }[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Find first Monday on or after start date
  const current = new Date(start);
  const dayOfWeek = current.getDay();
  // getDay: 0=Sun, 1=Mon, ... so days until Monday:
  const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  current.setDate(current.getDate() + daysUntilMon);

  while (current <= end) {
    const monday = toLocalIso(current);
    const friday = new Date(current);
    friday.setDate(friday.getDate() + 4);
    const fridayStr = toLocalIso(friday);

    const monLabel = current.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    });
    const friLabel = friday.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    weeks.push({
      value: monday,
      label: `${monLabel} – ${friLabel}`,
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

// ============================================================
// Component
// ============================================================

interface GenerateSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: Term;
  templateCount: number;
  onSuccess: () => void;
}

export function GenerateSessionsDialog({
  open,
  onOpenChange,
  term,
  templateCount,
  onSuccess,
}: GenerateSessionsDialogProps) {
  const weeks = useMemo(
    () => getWeeksInTerm(term.start_date, term.end_date),
    [term.start_date, term.end_date]
  );

  const [selectedWeek, setSelectedWeek] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      // Reset state on close
      setSelectedWeek("");
      setResult(null);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleGenerate() {
    if (!selectedWeek) {
      setError("Please select a week.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const { data, error: genError } = await generateSessionsForWeek(
      term.id,
      selectedWeek
    );

    setLoading(false);

    if (genError) {
      setError(genError);
      return;
    }

    if (data) {
      setResult(data);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Sessions</DialogTitle>
          <DialogDescription>
            Create individual session records from the weekly template for a
            specific week
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="size-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Sessions generated successfully
                </p>
                <p className="text-sm text-green-700">
                  Created {result.created} session
                  {result.created !== 1 ? "s" : ""}
                  {result.skipped > 0 && (
                    <>, skipped {result.skipped} (already existed)</>
                  )}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Week</Label>
              {weeks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No weeks available in this term&apos;s date range.
                </p>
              ) : (
                <Select value={selectedWeek} onValueChange={(v) => setSelectedWeek(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a week" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeks.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedWeek && templateCount > 0 && (
              <p className="text-sm text-muted-foreground">
                This will generate up to{" "}
                <span className="font-medium">{templateCount}</span> session
                {templateCount !== 1 ? "s" : ""} for the selected week.
                Existing sessions will be skipped.
              </p>
            )}

            {templateCount === 0 && (
              <p className="text-sm text-amber-600">
                No template entries found. Add sessions to the weekly template
                first.
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !selectedWeek || templateCount === 0}
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Generating..." : "Generate Sessions"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
