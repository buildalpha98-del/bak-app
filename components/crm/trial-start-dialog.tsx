"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { startTrial } from "@/lib/crm/trial-actions";

// ============================================================
// Helpers
// ============================================================

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ============================================================
// Component
// ============================================================

interface TrialStartDialogProps {
  leadId: string;
  centreName: string;
  onStarted?: () => void;
}

export function TrialStartDialog({
  leadId,
  centreName,
  onStarted,
}: TrialStartDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const today = new Date();
  const [startDate, setStartDate] = useState(toDateString(today));
  const [endDate, setEndDate] = useState(
    toDateString(addDays(today, 14))
  );

  // When start date changes, auto-update end date to 2 weeks later
  function handleStartDateChange(value: string) {
    setStartDate(value);
    if (value) {
      const newEnd = addDays(new Date(value), 14);
      setEndDate(toDateString(newEnd));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates.");
      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      toast.error("End date must be after start date.");
      return;
    }

    startTransition(async () => {
      const result = await startTrial(leadId, startDate, endDate);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Trial started for ${centreName}`);
        setOpen(false);
        onStarted?.();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" />
        }
      >
        <CalendarDays className="size-3.5" />
        Start Trial
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Trial</DialogTitle>
          <DialogDescription>
            Schedule a free trial period for {centreName}. A trial centre will be
            created and linked to this lead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trial-start-date">Start Date</Label>
            <Input
              id="trial-start-date"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="h-10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trial-end-date">End Date</Label>
            <Input
              id="trial-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="h-10"
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Trial"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
