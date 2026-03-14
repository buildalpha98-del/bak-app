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
import { duplicateTerm } from "@/lib/terms/actions";
import type { Term } from "@/lib/types/database";

interface DuplicateTermDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: Term;
  onSuccess: () => void;
}

export function DuplicateTermDialog({
  open,
  onOpenChange,
  term,
  onSuccess,
}: DuplicateTermDialogProps) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clearCoaches, setClearCoaches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(`${term.name} (Copy)`);
    setYear(term.year.toString());
    setStartDate("");
    setEndDate("");
    setClearCoaches(false);
    setError(null);
  }, [term, open]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Term name is required.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: dupError } = await duplicateTerm({
      source_term_id: term.id,
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      year: parseInt(year, 10),
      clear_coaches: clearCoaches,
    });

    setLoading(false);

    if (dupError) {
      setError(dupError);
      return;
    }

    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate Term</DialogTitle>
          <DialogDescription>
            Create a copy of &quot;{term.name}&quot; with all template entries
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New Term Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearCoaches}
              onChange={(e) => setClearCoaches(e.target.checked)}
              className="size-4 rounded border accent-primary"
            />
            Clear coach assignments
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Duplicating..." : "Duplicate Term"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
