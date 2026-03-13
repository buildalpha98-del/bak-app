"use client";

import { useState, useTransition, useEffect } from "react";
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
import { ArrowRightLeft, Loader2, Check, ChevronLeft } from "lucide-react";
import { createSwapRequest } from "@/lib/sessions/coach-actions";
import { getReplacementSuggestions } from "@/lib/sessions/scheduling-actions";
import type { ReplacementSuggestion } from "@/lib/utils/scheduling";

// ============================================================
// Props
// ============================================================

interface SwapRequestDialogProps {
  sessionId: string;
  currentCoachId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================
// Steps
// ============================================================

type Step = "loading" | "select" | "confirm";

// ============================================================
// Availability badge colours
// ============================================================

function availabilityColour(status: string): string {
  switch (status) {
    case "available":
      return "bg-green-100 text-green-700";
    case "partial":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-red-100 text-red-700";
  }
}

function availabilityLabel(status: string): string {
  switch (status) {
    case "available":
      return "Available";
    case "partial":
      return "Partial";
    default:
      return "Unavailable";
  }
}

// ============================================================
// Component
// ============================================================

export function SwapRequestDialog({
  sessionId,
  currentCoachId,
  open,
  onOpenChange,
}: SwapRequestDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [selectedCoach, setSelectedCoach] =
    useState<ReplacementSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch suggestions when dialog opens
  useEffect(() => {
    if (!open) return;

    // Reset state
    setStep("loading");
    setSuggestions([]);
    setSelectedCoach(null);
    setError(null);

    let cancelled = false;

    async function load() {
      const res = await getReplacementSuggestions(sessionId);
      if (cancelled) return;

      if (res.error || !res.data) {
        setError(res.error ?? "Failed to load suggestions.");
        setStep("select");
        return;
      }

      // Filter out the current coach
      const filtered = res.data.filter(
        (s) => s.coachId !== currentCoachId
      );
      setSuggestions(filtered);
      setStep("select");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, currentCoachId]);

  function handleSubmit() {
    if (!selectedCoach) return;

    setError(null);
    startTransition(async () => {
      const result = await createSwapRequest(
        sessionId,
        selectedCoach.coachId
      );
      if (result.error) {
        setError(result.error);
      } else {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  function handleClose(val: boolean) {
    if (!val) {
      setStep("loading");
      setSuggestions([]);
      setSelectedCoach(null);
      setError(null);
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-4" />
            Request Swap
          </DialogTitle>
          <DialogDescription>
            {step === "loading" && "Finding the best available coaches…"}
            {step === "select" &&
              "Select a replacement coach. They will receive a notification to accept or decline."}
            {step === "confirm" && "Review and submit your swap request."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Loading */}
        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Analysing availability…
            </p>
          </div>
        )}

        {/* Step 2: Selection */}
        {step === "select" && (
          <div className="space-y-3 py-2">
            {suggestions.length === 0 && !error ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No replacement coaches available for this session.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {suggestions.map((coach, idx) => {
                  const isSelected =
                    selectedCoach?.coachId === coach.coachId;
                  return (
                    <button
                      key={coach.coachId}
                      type="button"
                      onClick={() => {
                        setSelectedCoach(coach);
                        setError(null);
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Rank */}
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isSelected
                              ? "bg-primary text-white"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="flex-1 min-w-0">
                          {/* Name + Score */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {coach.coachName}
                            </span>
                            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {coach.score}/100
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${availabilityColour(coach.availability)}`}
                            >
                              {availabilityLabel(coach.availability)}
                            </span>
                          </div>

                          {/* Reasons */}
                          {coach.reasons.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {coach.reasons.map((reason) => (
                                <span
                                  key={reason}
                                  className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Selection indicator */}
                        {isSelected && (
                          <Check className="size-4 shrink-0 text-primary mt-0.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === "confirm" && selectedCoach && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Replacement Coach
              </p>
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                  {selectedCoach.coachName.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedCoach.coachName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Score: {selectedCoach.score}/100 ·{" "}
                    {availabilityLabel(selectedCoach.availability)}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              They will receive a notification to accept or decline. If
              accepted, operations will give final approval.
            </p>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex gap-2 sm:gap-0">
          {step === "select" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedCoach) {
                    setError("Please select a replacement coach.");
                    return;
                  }
                  setError(null);
                  setStep("confirm");
                }}
                disabled={!selectedCoach}
                className="min-h-[44px] bg-primary hover:bg-primary/90"
              >
                Next
              </Button>
            </>
          )}

          {step === "confirm" && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                className="min-h-[44px]"
                disabled={isPending}
              >
                <ChevronLeft className="mr-1 size-4" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="min-h-[44px] bg-primary hover:bg-primary/90"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </>
          )}

          {step === "loading" && (
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
