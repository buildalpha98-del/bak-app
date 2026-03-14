"use client";

import { useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cancelSessionAsCoach } from "@/lib/rerostering/actions";
import type { CancellationReasonType } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

interface CancelSessionDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const REASON_OPTIONS: { value: CancellationReasonType; label: string }[] = [
  { value: "sick", label: "Sick" },
  { value: "emergency", label: "Emergency" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

// ============================================================
// Component
// ============================================================

export function CancelSessionDialog({
  sessionId,
  open,
  onOpenChange,
  onSuccess,
}: CancelSessionDialogProps) {
  const [reason, setReason] = useState<CancellationReasonType | "">("");
  const [details, setDetails] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason("");
    setDetails("");
    setSubmitted(false);
    setError(null);
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  function handleSubmit() {
    if (!reason) return;
    setError(null);

    startTransition(async () => {
      const result = await cancelSessionAsCoach(
        sessionId,
        reason as CancellationReasonType,
        details || undefined
      );

      if (result.error) {
        setError(result.error);
      } else {
        setSubmitted(true);
        onSuccess?.();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="size-6 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">
                Session Cancelled
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Ops has been notified and is finding a replacement.
              </p>
            </div>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Can&apos;t Make It</DialogTitle>
              <DialogDescription>
                Let ops know you need to cancel this session. A replacement
                coach will be arranged.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Reason</Label>
                <Select
                  value={reason}
                  onValueChange={(v) =>
                    setReason(v as CancellationReasonType)
                  }
                >
                  <SelectTrigger id="cancel-reason">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancel-details">Details (optional)</Label>
                <Textarea
                  id="cancel-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Any additional information..."
                  rows={3}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={!reason || isPending}
              >
                {isPending && (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                )}
                Cancel Session
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
