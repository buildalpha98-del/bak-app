"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCheck, Loader2, Check } from "lucide-react";
import { bulkConfirmShifts } from "@/lib/sessions/shift-actions";
import { formatTime12, formatDateShort } from "@/lib/utils/roster";

// ============================================================
// Types
// ============================================================

export interface PendingSession {
  id: string;
  date: string;
  time: string;
  sport: string;
  centre_name: string;
}

interface BulkConfirmDialogProps {
  sessions: PendingSession[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================
// Component
// ============================================================

export function BulkConfirmDialog({
  sessions,
  open,
  onOpenChange,
}: BulkConfirmDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    confirmed: number;
    skipped: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirmAll() {
    setError(null);
    setResult(null);

    startTransition(async () => {
      const ids = sessions.map((s) => s.id);
      const res = await bulkConfirmShifts(ids);

      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setResult(res.data);
        // Auto-close after a short delay on success
        setTimeout(() => {
          onOpenChange(false);
          setResult(null);
          router.refresh();
        }, 1500);
      }
    });
  }

  function handleClose(open: boolean) {
    if (!open) {
      setError(null);
      setResult(null);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="size-4" />
            Confirm All Shifts
          </DialogTitle>
          <DialogDescription>
            Confirm all {sessions.length} pending shift
            {sessions.length > 1 ? "s" : ""} at once.
          </DialogDescription>
        </DialogHeader>

        {/* Session list */}
        <div className="max-h-60 space-y-2 overflow-y-auto py-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {s.sport} — {s.centre_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateShort(s.date)} · {formatTime12(s.time)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Result feedback */}
        {result && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
            <Check className="size-4 text-green-600" />
            <p className="text-sm text-green-700">
              {result.confirmed} shift{result.confirmed !== 1 ? "s" : ""}{" "}
              confirmed
              {result.skipped > 0 && ` (${result.skipped} skipped)`}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            className="min-h-[44px]"
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmAll}
            disabled={isPending || !!result}
            className="min-h-[44px] bg-primary hover:bg-primary/90"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Confirming…
              </>
            ) : (
              `Confirm All (${sessions.length})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
