"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { startCentreOnboarding } from "@/lib/onboarding/actions";
import { useRouter } from "next/navigation";

interface Centre {
  id: string;
  name: string;
}

interface StartOnboardingButtonProps {
  centres: Centre[];
}

export function StartOnboardingButton({ centres }: StartOnboardingButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCentreId, setSelectedCentreId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setSelectedCentreId("");
    setError(null);
    setOpen(true);
  }

  function handleStart() {
    if (!selectedCentreId) {
      setError("Please select a centre.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startCentreOnboarding(selectedCentreId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm">
        <Plus className="h-4 w-4 mr-1" /> Start Onboarding
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start Centre Onboarding</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="centre-select">Select Centre</Label>
              <Select
                value={selectedCentreId}
                onValueChange={(v) => setSelectedCentreId(v ?? "")}
              >
                <SelectTrigger id="centre-select">
                  <SelectValue placeholder="Choose a centre…" />
                </SelectTrigger>
                <SelectContent>
                  {centres.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      All centres already have onboardings
                    </SelectItem>
                  ) : (
                    centres.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={isPending || centres.length === 0}
            >
              {isPending ? "Starting…" : "Start Onboarding"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
