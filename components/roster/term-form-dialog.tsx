"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createTerm, updateTerm } from "@/lib/terms/actions";
import type { Term } from "@/lib/types/database";

interface TermFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term?: Term;
  onSuccess: () => void;
}

export function TermFormDialog({
  open,
  onOpenChange,
  term,
  onSuccess,
}: TermFormDialogProps) {
  const isEdit = !!term;

  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (term) {
      setName(term.name);
      setYear(term.year.toString());
      setStartDate(term.start_date);
      setEndDate(term.end_date);
    } else {
      setName("");
      setYear(new Date().getFullYear().toString());
      setStartDate("");
      setEndDate("");
    }
    setError(null);
  }, [term, open]);

  function validateWeeks(): string | null {
    if (!startDate || !endDate) return "Start and end dates are required.";
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) return "End date must be after start date.";
    const diffMs = end.getTime() - start.getTime();
    const weeks = diffMs / (7 * 24 * 60 * 60 * 1000);
    if (weeks < 7) return "Term should be at least 8 weeks.";
    if (weeks > 13) return "Term should be no more than 12 weeks.";
    return null;
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Term name is required.");
      return;
    }
    const weekError = validateWeeks();
    if (weekError) {
      setError(weekError);
      return;
    }

    setLoading(true);
    setError(null);

    if (isEdit && term) {
      const { error: updateError } = await updateTerm(term.id, {
        name: name.trim(),
        year: parseInt(year, 10),
        start_date: startDate,
        end_date: endDate,
      });
      setLoading(false);
      if (updateError) {
        setError(updateError);
        return;
      }
    } else {
      const { error: createError } = await createTerm({
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        year: parseInt(year, 10),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Term" : "Create Term"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the term details"
              : "Create a new school term for rostering"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="termName">Term Name</Label>
            <Input
              id="termName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Term 1 2026"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="termYear">Year</Label>
            <Input
              id="termYear"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Term"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
